import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Medal, Target, CheckCircle2, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries";
import type { Match, Profile } from "@/lib/database.types";
import Flag from "@/components/Flag";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

type PredictionWithMatch = {
  id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  points_awarded: number | null;
  matches: Match | null;
};

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const me = await getCurrentProfile();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  const profile = profileData as Profile | null;
  if (!profile) notFound();

  // RLS on predictions only returns rows for matches that have kicked off
  // (unless they're the viewer's own), so hidden pre-kickoff predictions of
  // other players never leak here.
  const [{ data: predictionsData }, { count: rankAbove }] = await Promise.all([
    supabase
      .from("predictions")
      .select("id, predicted_home_score, predicted_away_score, points_awarded, matches(*)")
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gt("points", profile.points),
  ]);

  const predictions = (predictionsData ?? []) as unknown as PredictionWithMatch[];
  const exact = predictions.filter((p) => p.points_awarded === 3).length;
  const rank = (rankAbove ?? 0) + 1;
  const isMe = me?.id === profile.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leaderboard
      </Link>

      <div className="card flex items-center gap-4 p-6">
        {profile.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.image} alt="" className="h-16 w-16 rounded-full" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/20 text-2xl font-bold text-gold">
            {profile.username.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            {profile.name}
            {isMe && <span className="badge bg-brand/20 text-brand">You</span>}
          </h1>
          <p className="text-slate-400">@{profile.username}</p>
          {profile.role === "ADMIN" && (
            <span className="mt-1 inline-block badge bg-gold/20 text-gold">Admin</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Medal} label="Points" value={profile.points} />
        <Stat icon={Target} label="Rank" value={`#${rank}`} />
        <Stat icon={CheckCircle2} label="Exact scores" value={exact} />
        <Stat icon={ListChecks} label="Predictions" value={predictions.length} />
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-bold">Prediction history</h2>
        {predictions.length === 0 ? (
          <p className="py-6 text-center text-slate-500">No predictions to show yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {predictions.map((p) => {
              const m = p.matches;
              if (!m) return null;
              return (
                <li key={p.id} className="flex items-center gap-3 py-3 text-sm">
                  <div className="flex flex-1 items-center gap-2">
                    <Flag code={m.home_flag} alt={m.home_team} size={24} />
                    <span className="truncate">{m.home_team}</span>
                    <span className="text-slate-500">vs</span>
                    <span className="truncate">{m.away_team}</span>
                    <Flag code={m.away_flag} alt={m.away_team} size={24} />
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">
                      {p.predicted_home_score} – {p.predicted_away_score}
                    </div>
                    {m.status === "FINISHED" && (
                      <div className="text-xs text-slate-500">
                        actual {m.home_score}–{m.away_score}
                      </div>
                    )}
                  </div>
                  {p.points_awarded !== null ? (
                    <span className="badge bg-gold/20 text-gold">+{p.points_awarded}</span>
                  ) : (
                    <StatusBadge status={m.status} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card flex flex-col items-center gap-1 p-4 text-center">
      <Icon className="h-6 w-6 text-gold" />
      <div className="text-xl font-extrabold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
