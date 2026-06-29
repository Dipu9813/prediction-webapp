"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PredictionForm({
  matchId,
  homeTeam,
  awayTeam,
  locked,
  isKnockout = false,
}: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  locked: boolean;
  isKnockout?: boolean;
}) {
  const router = useRouter();
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [advancer, setAdvancer] = useState<"HOME" | "AWAY" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A knockout can't end level, so when the user predicts a draw we ask which
  // team they think goes through (penalties). For a decisive pick the advancer
  // is implied by the higher score, so we don't ask.
  const isDraw = home !== "" && away !== "" && Number(home) === Number(away);
  const needsAdvancer = isKnockout && isDraw;

  if (locked) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-400">
        <Lock className="h-4 w-4" /> Predictions are closed for this match.
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (home === "" || away === "") {
      setError("Enter both scores.");
      return;
    }
    if (needsAdvancer && !advancer) {
      setError("Pick which team advances.");
      return;
    }
    setSaving(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError("You must be logged in.");
      return;
    }

    // RLS enforces: own prediction only, before kickoff only. The unique
    // constraint blocks duplicates. So the DB is the real gatekeeper here.
    const { error } = await supabase.from("predictions").insert({
      user_id: user.id,
      match_id: matchId,
      predicted_home_score: Number(home),
      predicted_away_score: Number(away),
      predicted_advancer: needsAdvancer ? advancer : null,
    });

    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        setError("You have already predicted this match. Predictions cannot be changed.");
      } else if (error.code === "42501") {
        setError("Predictions are locked — this match has kicked off.");
      } else {
        setError(error.message);
      }
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <div className="text-right text-sm font-medium text-slate-300" style={{ minWidth: 70 }}>
          {homeTeam}
        </div>
        <input
          aria-label={`${homeTeam} score`}
          type="number"
          min={0}
          max={99}
          value={home}
          onChange={(e) => setHome(e.target.value)}
          className="input w-14 text-center text-lg font-bold"
        />
        <span className="text-slate-500">:</span>
        <input
          aria-label={`${awayTeam} score`}
          type="number"
          min={0}
          max={99}
          value={away}
          onChange={(e) => setAway(e.target.value)}
          className="input w-14 text-center text-lg font-bold"
        />
        <div className="text-left text-sm font-medium text-slate-300" style={{ minWidth: 70 }}>
          {awayTeam}
        </div>
      </div>

      {needsAdvancer && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-center text-xs text-slate-400">
            A draw can&apos;t decide a knockout — who goes through?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["HOME", "AWAY"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setAdvancer(side)}
                className={
                  "rounded-lg px-3 py-2 text-sm font-semibold transition " +
                  (advancer === side
                    ? "bg-brand text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/10")
                }
              >
                {side === "HOME" ? homeTeam : awayTeam}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        {saving ? "Submitting…" : "Lock in prediction"}
      </button>
      <p className="text-center text-xs text-slate-500">
        Predictions are final and cannot be changed once submitted.
      </p>
    </form>
  );
}
