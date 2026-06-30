-- =============================================================================
-- Frenzy Creator — Initial Admin Seed
-- =============================================================================
-- Run this ONCE after the base schema migration to create your first admin.
--
-- IMPORTANT: The admin panel currently stores passwords as plaintext in the
-- password_hash column (the column name is a misnomer inherited from an earlier
-- design). The hardcoded default password has been REMOVED from the app for
-- security. You MUST:
--
--   1. Replace 'CHANGE_ME_IMMEDIATELY' below with a strong password before
--      running this seed.
--   2. Log in to admin.html and use the "Change Password" feature to rotate
--      the password after first login.
--   3. Long-term: migrate to Supabase Auth (supabase.com/docs/guides/auth) so
--      passwords are never stored or compared in plaintext.
-- =============================================================================

insert into public.admins (username, password_hash, display_name, role, created_by)
values (
  'admin',
  'CHANGE_ME_IMMEDIATELY',   -- ← replace with your actual password before running
  'Master Admin',
  'master',
  'system'
)
on conflict (username) do nothing;

-- =============================================================================
-- Default Global Settings
-- These are the rev-share defaults shown in admin.html → Settings tab.
-- Adjust the values as needed before running.
-- =============================================================================
insert into public.settings (key, value)
values
  ('rev_share_l1_default', '10'),
  ('rev_share_l2_default', '5')
on conflict (key) do nothing;
