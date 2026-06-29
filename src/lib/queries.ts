import { createClient } from "@/lib/supabase/server";
import type { Advancer, MatchStatus, Profile } from "@/lib/database.types";
import { isLocked } from "@/lib/utils";

export type PublicPrediction = {
  username: string;
  name: string;
  image: string | null;
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedAdvancer: Advancer | null;
  pointsAwarded: number | null;
};

// Who has predicted a match, without their scores (shown before kickoff).
export type Predictor = {
  username: string;
  name: string;
  image: string | null;
};

export type MatchDTO = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string | null;
  awayFlag: string | null;
  stadium: string | null;
  kickoffTime: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  stage: string | null;
  isKnockout: boolean;
  advancer: Advancer | null;
  wentToPenalties: boolean;
  homePens: number | null;
  awayPens: number | null;
  locked: boolean;
  myPrediction: {
    predictedHomeScore: number;
    predictedAwayScore: number;
    predictedAdvancer: Advancer | null;
    pointsAwarded: number | null;
  } | null;
  allPredictions: PublicPrediction[] | null; // null while hidden (before kickoff)
  predictors: Predictor[]; // who has predicted (identities only); used before kickoff
  predictionCount: number;
};

// Row shape returned when joining predictions -> profiles.
type PredictionJoin = {
  user_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  predicted_advancer: Advancer | null;
  points_awarded: number | null;
  profiles: { username: string; name: string; image: string | null } | null;
};

type MatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  home_flag: string | null;
  away_flag: string | null;
  stadium: string | null;
  kickoff_time: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  stage: string | null;
  advancer: Advancer | null;
  went_to_penalties: boolean;
  home_pens: number | null;
  away_pens: number | null;
  prediction_count: number;
  predictions: PredictionJoin[];
};

const SELECT =
  "*, predictions(user_id, predicted_home_score, predicted_away_score, predicted_advancer, points_awarded, profiles(username, name, image))";

function toDTO(m: MatchRow, userId: string | null, predictors: Predictor[] = []): MatchDTO {
  const locked = isLocked(m.kickoff_time);
  // The DB status only updates when the sync job runs (cron). If kickoff has
  // passed but the status hasn't been flipped yet, treat the match as LIVE so
  // it never falls into a gap between "upcoming" and "finished" and disappears.
  const status: MatchStatus =
    m.status !== "FINISHED" && locked ? "LIVE" : m.status;
  // RLS already hides others' predictions before kickoff, but we double-guard here.
  const mine = userId ? m.predictions.find((p) => p.user_id === userId) : undefined;

  // Everyone's picks are revealed once the match has kicked off OR once you have
  // made your own prediction (predicting unlocks viewing). Mirrors the RLS rule.
  const revealed = locked || mine !== undefined;

  const allPredictions: PublicPrediction[] | null = revealed
    ? m.predictions
        .map((p) => ({
          username: p.profiles?.username ?? "player",
          name: p.profiles?.name ?? "",
          image: p.profiles?.image ?? null,
          predictedHomeScore: p.predicted_home_score,
          predictedAwayScore: p.predicted_away_score,
          predictedAdvancer: p.predicted_advancer,
          pointsAwarded: p.points_awarded,
        }))
        .sort((a, b) => (b.pointsAwarded ?? 0) - (a.pointsAwarded ?? 0))
    : null;

  return {
    id: m.id,
    homeTeam: m.home_team,
    awayTeam: m.away_team,
    homeFlag: m.home_flag,
    awayFlag: m.away_flag,
    stadium: m.stadium,
    kickoffTime: m.kickoff_time,
    status,
    homeScore: m.home_score,
    awayScore: m.away_score,
    stage: m.stage,
    isKnockout: m.stage != null && m.stage !== "GROUP_STAGE",
    advancer: m.advancer,
    wentToPenalties: m.went_to_penalties,
    homePens: m.home_pens,
    awayPens: m.away_pens,
    locked,
    myPrediction: mine
      ? {
          predictedHomeScore: mine.predicted_home_score,
          predictedAwayScore: mine.predicted_away_score,
          predictedAdvancer: mine.predicted_advancer,
          pointsAwarded: mine.points_awarded,
        }
      : null,
    allPredictions,
    predictors,
    predictionCount: m.prediction_count,
  };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}

export async function getMatches(): Promise<MatchDTO[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("matches")
    .select(SELECT)
    .order("kickoff_time", { ascending: true });
  if (error || !data) return [];

  return (data as unknown as MatchRow[]).map((m) => toDTO(m, user?.id ?? null));
}

export async function getMatch(id: string): Promise<MatchDTO | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.from("matches").select(SELECT).eq("id", id).single();
  if (error || !data) return null;

  const row = data as unknown as MatchRow;

  // While the full list is still hidden (you haven't predicted and kickoff
  // hasn't passed), fetch the identities of everyone who predicted — without
  // their scores — so the UI can show who's locked in. Once you predict, or the
  // match kicks off, the full list (with scores) is available and this is moot.
  const mine = user ? row.predictions.some((p) => p.user_id === user.id) : false;
  const revealed = isLocked(row.kickoff_time) || mine;
  let predictors: Predictor[] = [];
  if (!revealed) {
    const { data: rows } = await supabase.rpc("get_predictors", { p_match_id: id });
    predictors = (rows ?? []).map((p) => ({
      username: p.username,
      name: p.name,
      image: p.image,
    }));
  }

  return toDTO(row, user?.id ?? null, predictors);
}
