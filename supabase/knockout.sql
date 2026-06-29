-- ============================================================================
-- Migration: knockout scoring (advancer + penalty-aware on-pitch score).
-- Run this once in the Supabase SQL Editor on a database that already ran
-- setup.sql. It is additive (new nullable columns) so nothing existing breaks.
--
-- Scoring after this migration (points stack, so knockouts can reach 4):
--   +3  exact on-pitch scoreline (90/extra time; penalty-shootout goals excluded)
--   +1  correct outcome — result direction for group/decisive picks, or the
--       chosen advancer for a knockout draw pick.
-- ============================================================================

-- 1. New match columns ------------------------------------------------------
alter table public.matches
  add column if not exists stage             text,
  add column if not exists advancer          text,
  add column if not exists went_to_penalties boolean not null default false,
  add column if not exists home_pens         integer,
  add column if not exists away_pens         integer;

do $$ begin
  alter table public.matches
    add constraint matches_advancer_chk check (advancer in ('HOME', 'AWAY'));
exception when duplicate_object then null; end $$;

-- 2. New prediction column --------------------------------------------------
alter table public.predictions
  add column if not exists predicted_advancer text;

do $$ begin
  alter table public.predictions
    add constraint predictions_advancer_chk check (predicted_advancer in ('HOME', 'AWAY'));
exception when duplicate_object then null; end $$;

-- 3. Wider scoring function -------------------------------------------------
-- Drop the old 4-arg version so the new signature isn't an ambiguous overload.
drop function if exists public.points_for(int, int, int, int);

create or replace function public.points_for(
  ph int, pa int, ah int, aa int,
  p_is_knockout boolean default false,
  p_pred_adv text default null,
  p_match_adv text default null
) returns int
language sql
immutable
as $$
  select case
    -- Knockout that finished level and was decided by the advancer: exact draw
    -- score (+3) and correct advancer (+1) stack, so up to 4.
    when p_is_knockout and ah = aa and p_match_adv is not null then
      (case when ph = ah and pa = aa then 3 else 0 end)
      + (case when (case when ph > pa then 'HOME'
                         when pa > ph then 'AWAY'
                         else p_pred_adv end) = p_match_adv
              then 1 else 0 end)
    -- Everything else (decisive result, or group game): classic, max 3.
    else
      case
        when ph = ah and pa = aa then 3
        when sign(ph - pa) = sign(ah - aa) then 1
        else 0
      end
  end;
$$;

-- 4. score_match: pass the knockout flag + advancers --------------------------
create or replace function public.score_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
  v_knockout boolean;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then return; end if;

  v_knockout := m.stage is not null and m.stage <> 'GROUP_STAGE';

  if m.status = 'FINISHED' and m.home_score is not null and m.away_score is not null then
    update public.predictions p
       set points_awarded = public.points_for(
             p.predicted_home_score, p.predicted_away_score, m.home_score, m.away_score,
             v_knockout, p.predicted_advancer, m.advancer)
     where p.match_id = p_match_id;
  else
    update public.predictions set points_awarded = null where match_id = p_match_id;
  end if;

  perform set_config('app.scoring', 'on', true);

  update public.profiles pr
     set points = coalesce((
       select sum(p.points_awarded) from public.predictions p
       where p.user_id = pr.id and p.points_awarded is not null
     ), 0)
   where pr.id in (select user_id from public.predictions where match_id = p_match_id);
end;
$$;

-- 5. Re-score every finished match so existing predictions pick up the new
-- rules. (recalculate_all() can't be used here — its is_admin() guard fails for
-- the SQL-editor role, which has no auth.uid().)
do $$
declare r record;
begin
  for r in select id from public.matches
           where status = 'FINISHED' and home_score is not null and away_score is not null loop
    perform public.score_match(r.id);
  end loop;
end $$;
