import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const [{ data: rows }, profile] = await Promise.all([
    supabase.rpc("get_leaderboard"),
    getCurrentProfile(),
  ]);

  const users = rows ?? [];
  const meId = profile?.id;
  const medal = ["text-gold", "text-slate-300", "text-amber-600"];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="h-7 w-7 text-gold" />
        <h1 className="text-2xl font-extrabold">Global leaderboard</h1>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="w-10 px-2 py-3 sm:px-4">#</th>
              <th className="px-2 py-3 sm:px-4">Player</th>
              <th className="w-14 px-2 py-3 text-center sm:px-4">Exact</th>
              <th className="w-16 px-2 py-3 text-right sm:px-4">Points</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className={cn("border-t border-white/5", u.id === meId && "bg-brand/10")}>
                <td className={cn("px-2 py-3 font-bold sm:px-4", medal[i] ?? "text-slate-500")}>
                  {Number(u.rank)}
                </td>
                <td className="px-2 py-3 sm:px-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.image} alt="" className="h-8 w-8 shrink-0 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="truncate">{u.username}</span>
                        {u.id === meId && <span className="badge shrink-0 bg-brand/20 text-brand">You</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">{u.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3 text-center text-slate-300 sm:px-4">{Number(u.exact_count)}</td>
                <td className="px-2 py-3 text-right text-lg font-extrabold text-gold sm:px-4">{u.points}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
