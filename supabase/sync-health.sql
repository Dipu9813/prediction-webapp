-- ---------------------------------------------------------------------------
-- Sync health
--   Records when the football-data.org sync last ran successfully, so the
--   admin panel can warn if the cron (cron-job.org / Vercel) has died.
--
--   Writes happen only from the sync route via the service-role client, which
--   bypasses RLS, so there is no INSERT/UPDATE policy here on purpose.
--   Run this once in the Supabase SQL Editor.
-- ---------------------------------------------------------------------------
create table if not exists public.app_meta (
  key   text primary key,
  value text
);

alter table public.app_meta enable row level security;

-- Anyone logged in can read it (the admin page does); nobody can write via the
-- anon/auth key.
drop policy if exists app_meta_select on public.app_meta;
create policy app_meta_select on public.app_meta
  for select to authenticated using (true);
