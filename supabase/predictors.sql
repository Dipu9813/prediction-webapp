-- ============================================================================
-- Migration for databases that already ran setup.sql. Run this once in the
-- Supabase SQL Editor.
--
-- Adds get_predictors(): returns WHO has predicted a match (username/name/image)
-- WITHOUT exposing their predicted scores. This powers the "players who have
-- locked in their pick" list shown before kickoff, while the actual scores stay
-- hidden until the match starts (still enforced by RLS on the predictions table).
-- ============================================================================

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
