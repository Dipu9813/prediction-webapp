-- ============================================================================
-- Migration: correct penalty-shootout scoring + advancer-aware knockout points.
-- Run once in the Supabase SQL Editor on a DB that already ran setup.sql
-- (+ knockout.sql).
--
-- Why: football-data.org's free tier returns an unreliable `penalties` object
-- and a null `winner` for some shootouts (observed Germany–Paraguay reported as
-- 4–4 / no winner for a real 3–4; Netherlands–Morocco as 3–3 for a real 2–3).
-- The app now derives the tally + advancer from `fullTime` instead (see
-- src/lib/football.ts), but the DB also needs:
--
--   1. The re-score trigger only watched status/home_score/away_score, so an
--      advancer-only correction on re-sync would NOT recompute points.
--   2. Knockout scoring: a draw pick that named the right team to advance now
--      earns +1 even when the match is decided on the pitch (e.g. predict 1-1
--      away-adv, match ends 1-3 to away -> +1), not only on penalties.
--   3. Existing rows already hold the wrong advancer/pens and stale points.
--
-- After running this, re-sync (admin "Sync real matches") to push the corrected
-- advancer/pens; the trigger then re-scores affected matches automatically.
-- ============================================================================

-- 1. Knockout scoring: exact = 3; else 1 for correct direction OR advancer.
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
    -- Knockout decided by penalties (level on the pitch): score and advancer
    -- are independent calls, so they STACK (max 4).
    when p_is_knockout and ah = aa and p_match_adv is not null then
      (case when ph = ah and pa = aa then 3 else 0 end)
      + (case when (case when ph > pa then 'HOME'
                         when pa > ph then 'AWAY'
                         else p_pred_adv end) = p_match_adv
              then 1 else 0 end)
    -- Knockout decided on the pitch: exact = 3; else 1 for correct direction
    -- OR correct advancer (rescues a draw pick that named the team that went
    -- through). Mutually exclusive, max 3.
    when p_is_knockout and p_match_adv is not null then
      case
        when ph = ah and pa = aa then 3
        when sign(ph - pa) = sign(ah - aa)
          or (case when ph > pa then 'HOME'
                   when pa > ph then 'AWAY'
                   else p_pred_adv end) = p_match_adv then 1
        else 0
      end
    -- Group stage / not yet decided: classic, mutually exclusive, max 3.
    else
      case
        when ph = ah and pa = aa then 3
        when sign(ph - pa) = sign(ah - aa) then 1
        else 0
      end
  end;
$$;

-- 2. Re-score whenever the advancer changes too (not just score/status).
create or replace function public.on_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     or (new.home_score is distinct from old.home_score)
     or (new.away_score is distinct from old.away_score)
     or (new.advancer is distinct from old.advancer) then
    perform public.score_match(new.id);
  end if;
  return new;
end;
$$;

-- 3. Hand-correct the two shootouts the free-tier feed got wrong (its fullTime/
--    penalties/winner are all unreliable here, so neither the old code nor the
--    derive-from-fullTime fix can recover the real tally — it must be set by
--    hand). Real results: Paraguay beat Germany 4–3 on pens (1–1), Morocco beat
--    the Netherlands 3–2 on pens (1–1). Sync now leaves FINISHED matches alone,
--    so these stick.
update public.matches
   set home_score = 1, away_score = 1,
       went_to_penalties = true, home_pens = 3, away_pens = 4, advancer = 'AWAY'
 where home_team ilike 'Germany' and away_team ilike 'Paraguay';

update public.matches
   set home_score = 1, away_score = 1,
       went_to_penalties = true, home_pens = 2, away_pens = 3, advancer = 'AWAY'
 where home_team ilike 'Netherlands' and away_team ilike 'Morocco';

-- 4. Recompute every finished match now, so points are correct even before the
--    next sync. (This mirrors recalculate_all() but skips its is_admin() gate,
--    which would reject the SQL Editor's auth-less session.)
do $$
declare r record;
begin
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
end $$;
