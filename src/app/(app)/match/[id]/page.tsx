import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff, Lock } from "lucide-react";
import { getMatch } from "@/lib/queries";
import Flag from "@/components/Flag";
import Countdown from "@/components/Countdown";
import StatusBadge from "@/components/StatusBadge";
import PredictionForm from "@/components/PredictionForm";
import AutoRefresh from "@/components/AutoRefresh";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatch(id);
  if (!match) notFound();

  // Live matches carry a score too (football-data.org reports it mid-match), so
  // show the scoreline whenever one exists and the match isn't still upcoming.
  const showScore =
    match.status !== "UPCOMING" && match.homeScore !== null && match.awayScore !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {match.status === "LIVE" && <AutoRefresh intervalMs={30000} />}
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
          <StatusBadge status={match.status} />
          <LocalTime iso={match.kickoffTime} />
        </div>

        <div className="flex items-center justify-around gap-4">
          <div className="flex flex-1 flex-col items-center gap-2">
            <Flag code={match.homeFlag} alt={match.homeTeam} size={64} />
            <span className="text-center font-bold">{match.homeTeam}</span>
          </div>

          <div className="text-center">
            {showScore ? (
              <div className="text-4xl font-extrabold tabular-nums">
                {match.homeScore} <span className="text-slate-600">–</span> {match.awayScore}
              </div>
            ) : (
              <div className="text-2xl font-bold text-slate-500">vs</div>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-2">
            <Flag code={match.awayFlag} alt={match.awayTeam} size={64} />
            <span className="text-center font-bold">{match.awayTeam}</span>
          </div>
        </div>

        {match.stadium && (
          <p className="mt-4 text-center text-sm text-slate-500">{match.stadium}</p>
        )}
        {!match.locked && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Lock className="h-4 w-4" /> Locks in <Countdown kickoff={match.kickoffTime} />
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-bold">Your prediction</h2>
        {match.myPrediction ? (
          <div className="rounded-xl bg-brand/10 p-4 text-center">
            <div className="text-2xl font-extrabold text-brand">
              {match.myPrediction.predictedHomeScore} – {match.myPrediction.predictedAwayScore}
            </div>
            {match.myPrediction.pointsAwarded !== null && (
              <span className="mt-2 inline-block badge bg-gold/20 text-gold">
                Earned {match.myPrediction.pointsAwarded} points
              </span>
            )}
          </div>
        ) : (
          <PredictionForm
            matchId={match.id}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            locked={match.locked}
          />
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 flex items-center justify-between font-bold">
          All predictions
          <span className="text-sm font-normal text-slate-400">{match.predictionCount} total</span>
        </h2>

        {match.allPredictions === null ? (
          match.predictors.length === 0 ? (
            <p className="py-6 text-center text-slate-500">
              No predictions yet — be the first to lock in a pick!
            </p>
          ) : (
            <>
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-slate-400">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  These players have locked in their pick. Predicted scores are
                  shown only after kickoff — so no one can copy.
                </p>
              </div>
              <ul className="divide-y divide-white/5">
                {match.predictors.map((p, i) => (
                  <li key={`${p.username}-${i}`} className="flex items-center gap-3 py-2.5">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {p.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 truncate">{p.username}</span>
                    <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                      <Lock className="h-3.5 w-3.5" /> Hidden
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : match.allPredictions.length === 0 ? (
          <p className="py-6 text-center text-slate-500">No predictions were made for this match.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {match.allPredictions.map((p, i) => (
              <li key={`${p.username}-${i}`} className="flex items-center gap-3 py-2.5">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                    {p.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="flex-1 truncate">{p.username}</span>
                <span className="font-bold tabular-nums">
                  {p.predictedHomeScore} – {p.predictedAwayScore}
                </span>
                {p.pointsAwarded !== null && (
                  <span className="badge bg-gold/20 text-gold">+{p.pointsAwarded}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
