import Link from "next/link";
import { redirect } from "next/navigation";
import { Medal, Target, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMatches, getCurrentProfile } from "@/lib/queries";
import MatchCard from "@/components/MatchCard";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [matches, leaderboardRes, exactRes, rankRes] = await Promise.all([
    getMatches(),
    supabase.rpc("get_leaderboard"),
    supabase
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("points_awarded", 3),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt("points", profile.points),
  ]);

  const leaderboard = (leaderboardRes.data ?? []).slice(0, 5);
  const exactCount = exactRes.count ?? 0;
  const myRank = (rankRes.count ?? 0) + 1;

  const now = Date.now();
  const upcoming = matches.filter((m) => new Date(m.kickoffTime).getTime() > now);
  const live = matches.filter((m) => m.status === "LIVE");
  const finished = matches.filter((m) => m.status === "FINISHED").slice(-6).reverse();

  return (
    <div className="space-y-8">
      {live.length > 0 && <AutoRefresh intervalMs={30000} />}
      <div>
        <h1 className="text-2xl font-extrabold">Hey {profile.username} 👋</h1>
        <p className="text-slate-400">Make your calls before kickoff.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon={Medal} label="Total points" value={profile.points} accent="text-gold" />
        <Stat icon={Target} label="Global rank" value={`#${myRank}`} accent="text-brand" />
        <Stat icon={CheckCircle2} label="Exact scores" value={exactCount} accent="text-sky-300" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {live.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Live now</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {live.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-bold">Upcoming matches</h2>
            {upcoming.length === 0 ? (
              <div className="card p-6 text-center text-slate-400">
                No upcoming matches yet. Check back soon!
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {upcoming.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            )}
          </section>

          {finished.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Recent results</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {finished.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-3">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Leaderboard</h2>
              <Link href="/leaderboard" className="text-xs text-brand hover:underline">
                View all
              </Link>
            </div>
            <ol className="space-y-2">
              {leaderboard.map((u) => (
                <li key={u.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-bold text-slate-500">{Number(u.rank)}</span>
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.image} alt="" className="h-7 w-7 rounded-full" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 truncate">{u.username}</span>
                  <span className="font-bold text-gold">{u.points}</span>
                </li>
              ))}
              {leaderboard.length === 0 && (
                <li className="text-sm text-slate-500">No players yet.</li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <Icon className={`h-8 w-8 ${accent}`} />
      <div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}
