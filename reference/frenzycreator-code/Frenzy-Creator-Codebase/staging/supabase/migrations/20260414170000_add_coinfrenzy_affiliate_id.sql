-- Ensure coinfrenzy_affiliate_id column exists on users table.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coinfrenzy_affiliate_id text;
