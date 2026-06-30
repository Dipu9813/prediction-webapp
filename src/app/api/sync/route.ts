import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWorldCupMatches } from "@/lib/football";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "ADMIN";
}

function hasCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runSync() {
  const matches = await fetchWorldCupMatches();
  if (matches.length === 0) {
    return { synced: 0, message: "No matches returned by the API yet." };
  }

  const admin = createAdminClient();

  // A finished result is FINAL. Never let a later sync overwrite a match we've
  // already recorded as FINISHED — the football-data.org free tier sometimes
  // mangles shootout data after full-time (impossible 3–3/4–4 tallies, null
  // winner) and would corrupt a correct/hand-corrected result. This also lets
  // admins fix scores by hand without the next sync wiping them. Live/upcoming
  // matches still update on every sync.
  const { data: finishedRows } = await admin
    .from("matches")
    .select("external_id")
    .eq("status", "FINISHED")
    .not("external_id", "is", null);
  const frozen = new Set((finishedRows ?? []).map((r) => r.external_id));
  const toUpsert = matches.filter((m) => !frozen.has(m.external_id));

  // Record a heartbeat so the admin panel can tell whether the cron is alive.
  await admin
    .from("app_meta")
    .upsert({ key: "last_synced_at", value: new Date().toISOString() }, { onConflict: "key" });

  if (toUpsert.length === 0) {
    return { synced: 0, skipped: frozen.size, message: "All matches already finalized." };
  }

  // Upsert on external_id so repeated syncs update scores/status in place.
  // Setting a finished score fires the DB trigger that awards points.
  const { error } = await admin
    .from("matches")
    .upsert(toUpsert, { onConflict: "external_id" });
  if (error) throw new Error(error.message);

  return { synced: toUpsert.length, skipped: matches.length - toUpsert.length };
}

// Cron (Vercel) calls GET with the Authorization: Bearer <CRON_SECRET> header.
export async function GET(req: Request) {
  if (!hasCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runSync());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin "Sync now" button calls POST with the user's session.
export async function POST() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json(await runSync());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
