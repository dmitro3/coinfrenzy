-- docs/09 §5.4 — admin onboarding / forced rotation.
--
-- Adds a single `must_reset_password` boolean to `admins`. When true:
--   - The login route forces the admin to the password-reset wizard
--     immediately after the first successful auth.
--   - The session token is not issued until the new password is set.
--
-- Used by:
--   - the staff invite flow (POST /api/admin/staff) — every new admin
--     starts with must_reset_password=true and a random temp password.
--   - the master "force password reset" admin action (master can flip
--     the flag on any other admin).

ALTER TABLE "admins"
  ADD COLUMN IF NOT EXISTS "must_reset_password" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
