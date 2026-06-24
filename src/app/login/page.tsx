"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3.1 0 5.9 1.2 8 3.1l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 35.7 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function LoginCard() {
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/dashboard";
  const hadError = params.get("error") === "auth";
  const [loading, setLoading] = useState(false);

  async function google() {
    setLoading(true);
    const supabase = createClient();
    // Always return to the origin the user is actually on (localhost in dev,
    // the deployed domain in prod). Using NEXT_PUBLIC_SITE_URL here would force
    // every login back to production even when developing locally.
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) setLoading(false);
    // On success the browser is redirected to Google, so no further UI needed.
  }

  return (
    <div className="card w-full max-w-sm space-y-5 p-8 text-center">
      <div>
        <h1 className="text-xl font-bold">Sign in to play</h1>
        <p className="mt-1 text-sm text-slate-400">
          Use your Google account to predict matches and join the leaderboard.
        </p>
      </div>

      {hadError && (
        <p className="text-sm text-red-400">Sign-in failed. Please try again.</p>
      )}

      <button onClick={google} disabled={loading} className="btn-ghost w-full bg-white text-slate-900 hover:bg-slate-100">
        <GoogleIcon />
        {loading ? "Redirecting…" : "Continue with Google"}
      </button>

      <p className="text-xs text-slate-500">
        New here? Signing in with Google automatically creates your account.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <Link href="/" className="flex items-center gap-2 font-bold">
        <Trophy className="h-6 w-6 text-gold" /> World Cup Predictor
      </Link>
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
