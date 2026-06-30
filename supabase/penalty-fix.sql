-- ============================================================================
-- Migration: correct penalty-shootout scoring. Run once in the Supabase SQL
-- Editor on a database that already ran setup.sql (+ knockout.sql).
--
-- Why: football-data.org's free tier returns an unreliable `penalties` object
-- and a null `winner` for some shootouts (observed Germany–Paraguay reported as
-- 4–4 / no winner for a real 3–4; Netherlands–Morocco as 3–3 for a real 2–3).
-- The app now derives the tally + advancer from `fullTime` instead (see
-- src/lib/football.ts), but two things still need fixing in the DB:
--
--   1. The re-score trigger only watched status/home_score/away_score, so an
--      advancer-only correction on re-sync would NOT recompute points.
--   2. Existing rows already hold the wrong advancer/pens.
--
-- After running this, re-sync (admin "Sync real matches") to push the corrected
-- advancer/pens; the trigger then re-scores affected matches automatically.
-- ============================================================================

-- 1. Re-score whenever the advancer changes too (not just score/status).
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

-- 2. Recompute every finished match now, so points are correct even before the
--    next sync lands the fixed advancer values. (This mirrors recalculate_all()
--    but skips its is_admin() gate, which would reject the SQL Editor's
--    auth-less session.)
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
