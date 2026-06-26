import { createClient } from "@/lib/supabase/server";
import type { MatchStatus, Profile } from "@/lib/database.types";
import { isLocked } from "@/lib/utils";

export type PublicPrediction = {
  username: string;
  name: string;
  image: string | null;
  predictedHomeScore: number;
  predictedAwayScore: number;
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
  locked: boolean;
  myPrediction: {
    predictedHomeScore: number;
    predictedAwayScore: number;
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
  prediction_count: number;
  predictions: PredictionJoin[];
};

const SELECT =
  "*, predictions(user_id, predicted_home_score, predicted_away_score, points_awarded, profiles(username, name, image))";

function toDTO(m: MatchRow, userId: string | null, predictors: Predictor[] = []): MatchDTO {
  const locked = isLocked(m.kickoff_time);
  // RLS already hides others' predictions before kickoff, but we double-guard here.
  const mine = userId ? m.predictions.find((p) => p.user_id === userId) : undefined;

  const allPredictions: PublicPrediction[] | null = locked
    ? m.predictions
        .map((p) => ({
          username: p.profiles?.username ?? "player",
          name: p.profiles?.name ?? "",
          image: p.profiles?.image ?? null,
          predictedHomeScore: p.predicted_home_score,
          predictedAwayScore: p.predicted_away_score,
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
    status: m.status,
    homeScore: m.home_score,
    awayScore: m.away_score,
    locked,
    myPrediction: mine
      ? {
          predictedHomeScore: mine.predicted_home_score,
          predictedAwayScore: mine.predicted_away_score,
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

  // Before kickoff, RLS hides other players' rows, so fetch the identities of
  // everyone who predicted (without their scores) to show who's locked in.
  // After kickoff the full list (with scores) is already available.
  let predictors: Predictor[] = [];
  if (!isLocked(row.kickoff_time)) {
    const { data: rows } = await supabase.rpc("get_predictors", { p_match_id: id });
    predictors = (rows ?? []).map((p) => ({
      username: p.username,
      name: p.name,
      image: p.image,
    }));
  }

  return toDTO(row, user?.id ?? null, predictors);
}
