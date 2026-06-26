import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Medal, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-5xl px-4">
      <nav className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 font-bold">
          <Image
            src="/logo.png"
            alt="Bhagya Bharosa AI"
            width={64}
            height={74}
            className="h-9 w-auto"
            priority
          />
          Bhagya Bharosa AI
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-gold">
            Sign in
          </Link>
        </div>
      </nav>

      <section className="py-16 text-center sm:py-24">
        <span className="badge bg-brand/20 text-brand">FIFA World Cup</span>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
          Predict every match.{" "}
          <span className="bg-gradient-to-r from-gold to-brand bg-clip-text text-transparent">
            Climb the leaderboard.
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-slate-400">
          Call the score before kickoff. Predictions stay hidden until the whistle blows — no
          copying, no cheating. Earn points and battle fans worldwide.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/login" className="btn-gold px-6 py-3 text-base">
            Sign in with Google
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-24 sm:grid-cols-3">
        {[
          {
            icon: Lock,
            title: "Locked at kickoff",
            text: "Submissions close automatically the moment a match starts — enforced by database security rules.",
          },
          {
            icon: Eye,
            title: "Hidden predictions",
            text: "Nobody sees your call until the match begins. Then everyone's predictions go public.",
          },
          {
            icon: Medal,
            title: "Live leaderboard",
            text: "3 points for an exact score, 1 for the right result. Points tally up automatically.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-6">
            <Icon className="h-8 w-8 text-gold" />
            <h3 className="mt-3 font-bold">{title}</h3>
            <p className="mt-1 text-sm text-slate-400">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
