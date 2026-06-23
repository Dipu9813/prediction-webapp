-- ============================================================================
-- Migration for databases that already ran setup.sql (the earlier version with
-- fake demo matches). Run this once in the Supabase SQL Editor.
--   1. Adds the external_id column used to sync real fixtures idempotently.
--   2. Deletes the fake demo matches (rows that didn't come from the API).
-- ============================================================================

alter table public.matches
  add column if not exists external_id text unique;

-- Remove the seeded fake matches (Brazil/Argentina, France/Germany, etc.).
-- Any match created via the real sync has a non-null external_id, so this only
-- clears the demo rows. (Cascades to their predictions, of which there are none.)
delete from public.matches where external_id is null;
