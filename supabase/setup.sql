-- ============================================================================
-- World Cup Predictor — Supabase schema, security & logic
-- Run this once in: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

-- Change this to the email that should automatically become ADMIN on signup.
-- (Used inside handle_new_user below.)
--   >>> dipuclaude90@gmail.com <<<

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type match_status as enum ('UPCOMING', 'LIVE', 'FINISHED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('USER', 'ADMIN');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One profile per auth user. Mirrors auth.users and holds app data.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default 'Fan',
  username    text not null unique,
  email       text,
  image       text,
  role        user_role not null default 'USER',
  points      integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.matches (
  id                uuid primary key default gen_random_uuid(),
  home_team         text not null,
  away_team         text not null,
  home_flag         text,
  away_flag         text,
  stadium           text,
  kickoff_time      timestamptz not null,
  status            match_status not null default 'UPCOMING',
  home_score        integer,
  away_score        integer,
  prediction_count  integer not null default 0,
  external_id       text unique, -- id from the football data API (for idempotent sync)
  created_at        timestamptz not null default now()
);
create index if not exists matches_kickoff_idx on public.matches (kickoff_time);

create table if not exists public.predictions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  match_id              uuid not null references public.matches (id) on delete cascade,
  predicted_home_score  integer not null check (predicted_home_score between 0 and 99),
  predicted_away_score  integer not null check (predicted_away_score between 0 and 99),
  submitted_at          timestamptz not null default now(),
  points_awarded        integer,
  -- Denormalised from profiles for easy recognition in the table editor.
  -- Filled automatically by a trigger (clients never set these).
  username              text,
  name                  text,
  unique (user_id, match_id) -- one prediction per user per match; prevents duplicates
);
create index if not exists predictions_match_idx on public.predictions (match_id);

-- Copy the predictor's username/name onto the prediction row on insert.
create or replace function public.set_prediction_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select username, name into new.username, new.name
  from public.profiles where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_prediction_identity on public.predictions;
create trigger trg_prediction_identity
  before insert on public.predictions
  for each row execute function public.set_prediction_identity();

-- ---------------------------------------------------------------------------
-- Helper: is the current user an admin?  (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> create a profile (reads name/username from signup metadata)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_base text;
  v_suffix int := 0;
begin
  v_base := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );
  -- sanitise
  v_base := regexp_replace(lower(v_base), '[^a-z0-9_]', '', 'g');
  if v_base = '' then v_base := 'fan'; end if;
  v_username := v_base;
  -- ensure uniqueness
  while exists (select 1 from public.profiles where username = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := v_base || v_suffix::text;
  end loop;

  insert into public.profiles (id, name, username, email, image, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      v_base
    ),
    v_username,
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    case when new.email = 'dipuclaude90@gmail.com' then 'ADMIN'::user_role
         else 'USER'::user_role end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep matches.prediction_count in sync
-- ---------------------------------------------------------------------------
create or replace function public.bump_prediction_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.matches set prediction_count = prediction_count + 1 where id = new.match_id;
  elsif (tg_op = 'DELETE') then
    update public.matches set prediction_count = greatest(prediction_count - 1, 0) where id = old.match_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_prediction_count on public.predictions;
create trigger trg_prediction_count
  after insert or delete on public.predictions
  for each row execute function public.bump_prediction_count();

-- ---------------------------------------------------------------------------
-- Scoring: exact = 3, correct outcome = 1, wrong = 0
-- ---------------------------------------------------------------------------
create or replace function public.points_for(
  ph int, pa int, ah int, aa int
) returns int
language sql
immutable
as $$
  select case
    when ph = ah and pa = aa then 3
    when sign(ph - pa) = sign(ah - aa) then 1
    else 0
  end;
$$;

-- Recompute points for one match, then refresh affected users' totals.
create or replace function public.score_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then return; end if;

  if m.status = 'FINISHED' and m.home_score is not null and m.away_score is not null then
    update public.predictions p
       set points_awarded = public.points_for(
             p.predicted_home_score, p.predicted_away_score, m.home_score, m.away_score)
     where p.match_id = p_match_id;
  else
    -- not finished -> clear any awarded points for this match
    update public.predictions set points_awarded = null where match_id = p_match_id;
  end if;

  -- Mark this as a trusted, system-driven totals update so guard_profile
  -- lets it through even when there is no admin JWT (e.g. the sync runs with
  -- the service-role key, where auth.uid() is null). Transaction-scoped.
  perform set_config('app.scoring', 'on', true);

  -- Refresh totals for every user who predicted this match.
  update public.profiles pr
     set points = coalesce((
       select sum(p.points_awarded) from public.predictions p
       where p.user_id = pr.id and p.points_awarded is not null
     ), 0)
   where pr.id in (select user_id from public.predictions where match_id = p_match_id);
end;
$$;

-- Re-score automatically whenever a match's result/status changes.
create or replace function public.on_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     or (new.home_score is distinct from old.home_score)
     or (new.away_score is distinct from old.away_score) then
    perform public.score_match(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_match_change on public.matches;
create trigger trg_match_change
  after update on public.matches
  for each row execute function public.on_match_change();

-- Full recalculation across every finished match (admin "Recalculate" button).
create or replace function public.recalculate_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  update public.predictions set points_awarded = null where points_awarded is not null;
  for r in select id from public.matches
           where status = 'FINISHED' and home_score is not null and away_score is not null loop
    perform public.score_match(r.id);
  end loop;
  perform set_config('app.scoring', 'on', true);
  update public.profiles pr
     set points = coalesce((
       select sum(p.points_awarded) from public.predictions p
       where p.user_id = pr.id and p.points_awarded is not null), 0)
   where pr.id is not null;
end;
$$;

-- Leaderboard (rank + exact-score count), bypasses RLS for a complete view.
create or replace function public.get_leaderboard()
returns table (
  rank bigint, id uuid, username text, name text, image text,
  points int, exact_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (order by pr.points desc, pr.created_at asc) as rank,
    pr.id, pr.username, pr.name, pr.image, pr.points,
    count(p.id) filter (where p.points_awarded = 3) as exact_count
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  group by pr.id
  order by pr.points desc, pr.created_at asc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Predictor identities for a match: WHO has predicted, WITHOUT their scores.
-- Lets the UI show participants before kickoff while picks stay hidden.
-- SECURITY DEFINER so it can see everyone's row even before kickoff (RLS would
-- otherwise hide them) — but it deliberately selects ONLY username/name/image,
-- never the predicted_* score columns, so the actual picks remain secret.
-- ---------------------------------------------------------------------------
create or replace function public.get_predictors(p_match_id uuid)
returns table (username text, name text, image text)
language sql
security definer
set search_path = public
as $$
  select pr.username, pr.name, pr.image
  from public.predictions p
  join public.profiles pr on pr.id = p.user_id
  where p.match_id = p_match_id
  order by p.submitted_at asc;
$$;

revoke all on function public.get_predictors(uuid) from public;
grant execute on function public.get_predictors(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.matches     enable row level security;
alter table public.predictions enable row level security;

-- profiles: everyone (logged in) can read; users update only their own row;
-- a guard trigger stops them changing role/points; admins can update anyone.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Stop non-admins from escalating role / editing their own points.
create or replace function public.guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow trusted, system-driven point updates (set inside score_match /
  -- recalculate_all) to pass through; otherwise non-admins can never change
  -- role or points.
  if not public.is_admin() and current_setting('app.scoring', true) is distinct from 'on' then
    new.role := old.role;
    new.points := old.points;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile
  before update on public.profiles
  for each row execute function public.guard_profile();

-- matches: anyone logged in can read; only admins can write.
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
  for select to authenticated using (true);

drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- predictions: THE CORE RULES
--  * SELECT: you always see your own; everyone else's only AFTER kickoff.
--  * INSERT: only your own, and only BEFORE kickoff.
--  * UPDATE/DELETE: no policy -> denied -> predictions are permanent.
drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_time <= now()
    )
  );

drop policy if exists predictions_insert on public.predictions;
create policy predictions_insert on public.predictions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_time > now()
    )
  );

-- ---------------------------------------------------------------------------
-- No seed data: real fixtures are pulled from football-data.org by the app's
-- /api/sync endpoint (admin "Sync" button or the Vercel cron). See README.
-- ---------------------------------------------------------------------------
