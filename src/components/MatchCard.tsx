import Link from "next/link";
import Flag from "@/components/Flag";
import Countdown from "@/components/Countdown";
import StatusBadge from "@/components/StatusBadge";
import PredictionForm from "@/components/PredictionForm";
import LocalTime from "@/components/LocalTime";
import type { MatchDTO } from "@/lib/queries";

export default function MatchCard({ match }: { match: MatchDTO }) {
  const finished = match.status === "FINISHED";

  return (
    <div className="card animate-fade-in p-5">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
        <StatusBadge status={match.status} />
        <LocalTime iso={match.kickoffTime} />
      </div>

      <Link href={`/match/${match.id}`} className="block">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-2">
            <Flag code={match.homeFlag} alt={match.homeTeam} />
            <span className="truncate font-semibold">{match.homeTeam}</span>
          </div>

          <div className="px-3 text-center">
            {finished ? (
              <div className="text-2xl font-extrabold tabular-nums">
                {match.homeScore} <span className="text-slate-500">–</span> {match.awayScore}
              </div>
            ) : (
              <div className="text-sm text-slate-500">vs</div>
            )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <span className="truncate text-right font-semibold">{match.awayTeam}</span>
            <Flag code={match.awayFlag} alt={match.awayTeam} />
          </div>
        </div>
      </Link>

      {match.stadium && (
        <p className="mt-2 text-center text-xs text-slate-500">{match.stadium}</p>
      )}

      <div className="mt-4 border-t border-white/10 pt-4">
        {!match.locked && (
          <div className="mb-3 flex items-center justify-center gap-2 text-xs text-slate-400">
            Kicks off in <Countdown kickoff={match.kickoffTime} />
          </div>
        )}

        {match.myPrediction ? (
          <div className="rounded-xl bg-brand/10 px-3 py-2 text-center text-sm">
            <span className="text-slate-300">Your prediction: </span>
            <span className="font-bold text-brand">
              {match.myPrediction.predictedHomeScore} – {match.myPrediction.predictedAwayScore}
            </span>
            {match.myPrediction.pointsAwarded !== null && (
              <span className="ml-2 badge bg-gold/20 text-gold">
                +{match.myPrediction.pointsAwarded} pts
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

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{match.predictionCount} prediction{match.predictionCount === 1 ? "" : "s"}</span>
          <Link href={`/match/${match.id}`} className="text-brand hover:underline">
            {match.locked ? "View all predictions →" : "Match details →"}
          </Link>
        </div>
      </div>
    </div>
  );
}
