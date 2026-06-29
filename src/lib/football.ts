import type { Database, MatchStatus } from "@/lib/database.types";

// Shape of the rows we upsert into Supabase `matches`.
export type MatchUpsert = Database["public"]["Tables"]["matches"]["Insert"] & {
  external_id: string;
};

// ---- football-data.org response types (only the fields we use) ----
type FDTeam = { name: string | null; crest: string | null };
type FDScorePair = { home: number | null; away: number | null };
type FDMatch = {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  stage?: string | null; // GROUP_STAGE | LAST_32 | LAST_16 | QUARTER_FINALS | ...
  venue?: string | null;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | null;
    fullTime: FDScorePair;
    // Only present on non-regulation matches:
    regularTime?: FDScorePair;
    extraTime?: FDScorePair;
    penalties?: FDScorePair;
  };
};
type FDResponse = { matches: FDMatch[] };

const n = (v: number | null | undefined) => v ?? 0;

function mapStatus(s: string): MatchStatus {
  switch (s) {
    case "LIVE":
    case "IN_PLAY":
    case "PAUSED":
    case "SUSPENDED":
      return "LIVE";
    case "FINISHED":
    case "AWARDED":
      return "FINISHED";
    default:
      return "UPCOMING"; // SCHEDULED, TIMED, POSTPONED, CANCELLED, etc.
  }
}

/** Fetch the configured competition's matches and map them to our row shape. */
export async function fetchWorldCupMatches(): Promise<MatchUpsert[]> {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) throw new Error("Missing FOOTBALL_DATA_API_KEY");

  const competition = process.env.FOOTBALL_COMPETITION || "WC";
  const season = process.env.FOOTBALL_SEASON; // optional

  const url = new URL(`https://api.football-data.org/v4/competitions/${competition}/matches`);
  if (season) url.searchParams.set("season", season);

  const res = await fetch(url, {
    headers: { "X-Auth-Token": token },
    // Always hit the API fresh; never cache live scores.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as FDResponse;

  return data.matches.map((m) => {
    const s = m.score;
    const wentToPenalties = s.duration === "PENALTY_SHOOTOUT";

    // The ON-PITCH score we score against. For a shootout, fullTime is polluted
    // with the penalty tally (e.g. a real 0–0 reported as "3–0"), so use the
    // 90+extra-time score instead. Otherwise fullTime is already correct.
    const homeScore = wentToPenalties
      ? n(s.regularTime?.home) + n(s.extraTime?.home)
      : s.fullTime.home;
    const awayScore = wentToPenalties
      ? n(s.regularTime?.away) + n(s.extraTime?.away)
      : s.fullTime.away;

    // Who actually advanced (penalties included). null for draws/unfinished.
    const advancer =
      s.winner === "HOME_TEAM" ? "HOME" : s.winner === "AWAY_TEAM" ? "AWAY" : null;

    return {
      external_id: String(m.id),
      home_team: m.homeTeam.name ?? "TBD",
      away_team: m.awayTeam.name ?? "TBD",
      home_flag: m.homeTeam.crest ?? null, // crest is a full image URL; Flag handles it
      away_flag: m.awayTeam.crest ?? null,
      stadium: m.venue ?? null,
      kickoff_time: m.utcDate,
      status: mapStatus(m.status),
      home_score: homeScore,
      away_score: awayScore,
      stage: m.stage ?? null,
      advancer,
      went_to_penalties: wentToPenalties,
      home_pens: wentToPenalties ? n(s.penalties?.home) : null,
      away_pens: wentToPenalties ? n(s.penalties?.away) : null,
    };
  });
}
