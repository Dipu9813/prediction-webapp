import { redirect } from "next/navigation";
import { Medal, Target, CheckCircle2, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries";
import type { Match } from "@/lib/database.types";
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

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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
          <h1 className="text-xl font-extrabold">{profile.name}</h1>
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
          <p className="py-6 text-center text-slate-500">No predictions yet.</p>
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
