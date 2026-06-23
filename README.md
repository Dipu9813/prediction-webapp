# ⚽ World Cup Predictor

A full-stack FIFA World Cup prediction platform. Predict match scores before
kickoff, watch predictions stay **hidden until the whistle blows**, earn points,
and climb a live leaderboard.

Built with **Next.js 15 (App Router) · TypeScript · Tailwind · Supabase**
(Postgres + Auth + Row-Level Security). No Prisma, no NextAuth — Supabase does it all.

---

## Core mechanics — enforced by the database, not just the UI

| Rule | Where it's enforced |
| --- | --- |
| Predictions allowed **only before kickoff** | RLS `INSERT` policy on `predictions` (checks `kickoff_time > now()`) |
| **One** prediction per user per match, **never editable** | `unique(user_id, match_id)` + no `UPDATE`/`DELETE` policy |
| Other users' predictions **hidden until kickoff** | RLS `SELECT` policy (own row, or any row whose match has kicked off) |
| Scoring: exact = **3**, correct result = **1**, wrong = **0** | `points_for()` + `score_match()` trigger on `matches` |
| Points recalculated automatically when a result is entered | `AFTER UPDATE` trigger on `matches` |
| Admin-only writes / admin area | RLS `is_admin()` policies + Next.js middleware |

> Because the rules live in **Row-Level Security policies and triggers**, they
> hold even if someone calls the Supabase API directly — the client can't bypass them.

---

## Setup

### 1. Create a Supabase project
[supabase.com](https://supabase.com) → New project.

### 2. Run the database setup
Open **SQL Editor → New query**, paste the contents of
[`supabase/setup.sql`](supabase/setup.sql), and **Run**. This creates the tables,
RLS policies, triggers, the leaderboard/recalculate functions, and some demo matches.

> The admin email is hardcoded near the top of `setup.sql` (`dipuclaude90@gmail.com`).
> Whoever signs up with that address automatically gets the ADMIN role. Change it
> there if needed, or flip a user's role later from the admin panel.

### 3. Enable Google sign-in (the only login method)
**Authentication → Providers → Google** → enable it and paste in your Google OAuth
client ID + secret (from the [Google Cloud console](https://console.cloud.google.com/apis/credentials)).
Then under **Authentication → URL Configuration**, add the redirect URL
`http://localhost:3000/auth/callback` (and your production URL).
You can disable the Email provider entirely — it isn't used.

### 4. Configure env
```bash
cp .env.example .env
```
Fill in from **Project Settings → API**:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
(Only the public anon key is needed — RLS does the access control. No service-role key.)

### 5. Run
```bash
npm install
npm run dev
```
Open http://localhost:3000 and sign in with Google — your account is created automatically.

---

## Project structure

```
supabase/setup.sql        Schema, RLS policies, triggers, RPC functions, demo data
src/lib/
  database.types.ts       Hand-written DB types (regenerate with `supabase gen types`)
  supabase/client.ts      Browser Supabase client (Client Components)
  supabase/server.ts      Server Supabase client (Server Components / Route Handlers)
  supabase/middleware.ts  Session refresh + route protection
  queries.ts              Match serialization + hidden-prediction shaping
  utils.ts                Lock helper, flag URLs, formatting
src/middleware.ts         Wires up the Supabase middleware
src/app/
  page.tsx                Landing
  login/                  Supabase Auth — Google sign-in only
  auth/callback/          OAuth code exchange
  (app)/                  Authenticated: dashboard, match/[id], leaderboard, profile, admin
src/components/           MatchCard, PredictionForm, Countdown, Navbar, admin/AdminClient
```

## How the data flows

- **Reads** (pages) use the server client; RLS automatically filters out hidden
  predictions, so `queries.ts` just shapes what comes back.
- **Writes** (submit prediction, admin add/edit match, toggle role) go straight
  from the client to Supabase; RLS decides if they're allowed.
- **Scoring** is fully in the database: an admin sets the final score → a trigger
  computes each prediction's points and refreshes every affected user's total.
- **Leaderboard** is the `get_leaderboard()` SQL function (rank + exact-score count).

## Real match data (football-data.org)

Fixtures and live scores come from [football-data.org](https://www.football-data.org)
(free tier includes the FIFA World Cup). The app never invents matches — they're
synced from the API into the `matches` table.

### One-time setup
1. **Get an API token:** register at
   [football-data.org/client/register](https://www.football-data.org/client/register)
   and copy your API token.
2. **Get your service-role key:** Supabase → Project Settings → API → `service_role`
   (secret). This lets the sync job write fixtures past RLS.
3. **Add server-only env vars** (see `.env.example`):
   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   FOOTBALL_DATA_API_KEY=...
   FOOTBALL_COMPETITION=WC
   FOOTBALL_SEASON=2026
   CRON_SECRET=<random>          # protects the cron endpoint
   ```
4. **If you ran the old setup.sql** (with fake demo matches), run
   [`supabase/realtime.sql`](supabase/realtime.sql) once to add `external_id`
   and delete the fakes. Fresh installs of `setup.sql` already include the column
   and no demo data.

### Pulling the data
- **Manual:** open `/admin` → **Sync real matches**. This fetches the World Cup
  fixtures + current scores and upserts them (idempotent — safe to click anytime).
  Entering/updating a finished score automatically awards points via the DB trigger.
- **Automatic (live):** the sync endpoint (`GET /api/sync`) is protected by
  `CRON_SECRET` (`Authorization: Bearer $CRON_SECRET`). Pages with a live match
  auto-refresh every 30s so scores update on screen. Two schedulers are wired up:
  - **`vercel.json`** — a daily safety sync (`0 6 * * *`). The Vercel **Hobby**
    plan only allows once-per-day crons; an every-minute schedule needs Vercel Pro.
  - **`.github/workflows/sync.yml`** — a free GitHub Actions cron that calls the
    endpoint every ~5 minutes (GitHub's minimum) for near-live updates. Add two
    repo secrets under **Settings → Secrets and variables → Actions**:
    `APP_URL` (your deployed URL, no trailing slash) and `CRON_SECRET`.

> Locally, use the admin **Sync** button, or hit the endpoint yourself:
> `curl -X GET localhost:3000/api/sync -H "Authorization: Bearer <CRON_SECRET>"`.

> Free-tier note: football-data.org allows 10 requests/min. A once-a-minute cron is
> well within limits. If the WC isn't on your plan, switch `FOOTBALL_COMPETITION`
> or upgrade.

## Deploy (Vercel)

1. Push to GitHub, import into Vercel.
2. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_SITE_URL` (your prod URL), plus the real-data ones:
   `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_DATA_API_KEY`, `FOOTBALL_COMPETITION`,
   `FOOTBALL_SEASON`, `CRON_SECRET`.
3. In Supabase **Authentication → URL Configuration**, add your prod URL +
   `/auth/callback` to the allowed redirect URLs.
4. The `vercel.json` cron starts running automatically and keeps scores live.

## Extending

- **Live updates:** swap the dashboard/match polling for Supabase Realtime
  subscriptions on `matches` / `predictions` for instant score & leaderboard updates.
- **Auto status flips:** a Supabase scheduled function (pg_cron) can move matches
  `UPCOMING → LIVE → FINISHED` from `kickoff_time` instead of doing it by hand.
- Bonus features from the spec (streaks, badges, private leagues) build naturally
  on this schema.
