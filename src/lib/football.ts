import type { Database, MatchStatus } from "@/lib/database.types";

// Shape of the rows we upsert into Supabase `matches`.
export type MatchUpsert = Database["public"]["Tables"]["matches"]["Insert"] & {
  external_id: string;
};

// ---- football-data.org response types (only the fields we use) ----
type FDTeam = { name: string | null; crest: string | null };
type FDMatch = {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  venue?: string | null;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: { fullTime: { home: number | null; away: number | null } };
};
type FDResponse = { matches: FDMatch[] };

function mapStatus(s: string): MatchStatus {
  switch (s) {
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

  return data.matches.map((m) => ({
    external_id: String(m.id),
    home_team: m.homeTeam.name ?? "TBD",
    away_team: m.awayTeam.name ?? "TBD",
    home_flag: m.homeTeam.crest ?? null, // crest is a full image URL; Flag handles it
    away_flag: m.awayTeam.crest ?? null,
    stadium: m.venue ?? null,
    kickoff_time: m.utcDate,
    status: mapStatus(m.status),
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
  }));
}
