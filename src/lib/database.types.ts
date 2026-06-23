// Hand-written types for our schema. (You can regenerate these with the Supabase
// CLI: `supabase gen types typescript` — but these stay in sync with setup.sql.)

export type MatchStatus = "UPCOMING" | "LIVE" | "FINISHED";
export type UserRole = "USER" | "ADMIN";

export type Profile = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  image: string | null;
  role: UserRole;
  points: number;
  created_at: string;
};

export type Match = {
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
  external_id: string | null;
  created_at: string;
};

export type Prediction = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  submitted_at: string;
  points_awarded: number | null;
  username: string | null;
  name: string | null;
};

export type LeaderboardRow = {
  rank: number;
  id: string;
  username: string;
  name: string;
  image: string | null;
  points: number;
  exact_count: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      matches: {
        Row: Match;
        Insert: Partial<Match> & Pick<Match, "home_team" | "away_team" | "kickoff_time">;
        Update: Partial<Match>;
        Relationships: [];
      };
      predictions: {
        Row: Prediction;
        Insert: Pick<
          Prediction,
          "user_id" | "match_id" | "predicted_home_score" | "predicted_away_score"
        >;
        Update: Partial<Prediction>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_leaderboard: { Args: Record<string, never>; Returns: LeaderboardRow[] };
      recalculate_all: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      match_status: MatchStatus;
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
