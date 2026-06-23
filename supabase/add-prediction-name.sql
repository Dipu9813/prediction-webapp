-- ============================================================================
-- Adds username + name onto predictions for easy recognition in the table editor.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.predictions
  add column if not exists username text,
  add column if not exists name text;

-- Trigger: stamp the predictor's username/name on each new prediction.
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

-- Backfill any predictions that already exist.
update public.predictions p
set username = pr.username, name = pr.name
from public.profiles pr
where pr.id = p.user_id
  and (p.username is null or p.name is null);
