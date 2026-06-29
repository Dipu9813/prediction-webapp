-- ============================================================================
-- Migration: "predicting unlocks viewing". Run once in the Supabase SQL Editor
-- on a database that already ran setup.sql.
--
-- New rule for seeing OTHER players' predictions on a match:
--   * it's your own, OR
--   * you have also predicted this match (early access before kickoff), OR
--   * the match has kicked off (public to everyone, as before).
-- ============================================================================

-- Helper: has the current user predicted this match?  SECURITY DEFINER is
-- essential — querying `predictions` inside that table's own RLS policy would
-- otherwise recurse. Running as owner bypasses RLS and reads only the caller.
create or replace function public.has_predicted(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.predictions
    where match_id = p_match_id and user_id = auth.uid()
  );
$$;

revoke all on function public.has_predicted(uuid) from public;
grant execute on function public.has_predicted(uuid) to authenticated;

-- Replace the SELECT policy to add the "you predicted it" path.
drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions
  for select to authenticated using (
    user_id = auth.uid()
    or public.has_predicted(match_id)
    or exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_time <= now()
    )
  );
