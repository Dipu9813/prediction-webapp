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
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 text-center">Exact</th>
              <th className="px-4 py-3 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className={cn("border-t border-white/5", u.id === meId && "bg-brand/10")}>
                <td className={cn("px-4 py-3 font-bold", medal[i] ?? "text-slate-500")}>
                  {Number(u.rank)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.image} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">
                        {u.username}
                        {u.id === meId && <span className="ml-2 badge bg-brand/20 text-brand">You</span>}
                      </div>
                      <div className="text-xs text-slate-500">{u.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-slate-300">{Number(u.exact_count)}</td>
                <td className="px-4 py-3 text-right text-lg font-extrabold text-gold">{u.points}</td>
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
