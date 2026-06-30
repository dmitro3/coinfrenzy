-- Two-factor plugin requirements (Better Auth 1.6.x).
--
-- The two-factor plugin needs:
--   1. A boolean `two_factor_enabled` on the user table.
--   2. A separate `auth_two_factor` table holding the TOTP secret + backup
--      codes per enrolled user.
--
-- Both are referenced from the drizzleAdapter schema map in apps/web/lib/auth.ts.

ALTER TABLE "auth_user"
  ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_two_factor" (
  "id"           text PRIMARY KEY,
  "user_id"      text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "secret"       text NOT NULL,
  "backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_two_factor_user_idx" ON "auth_two_factor" ("user_id");
--> statement-breakpoint

ALTER TABLE "auth_two_factor" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "auth_two_factor_self_read" ON "auth_two_factor" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND "user_id" = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "auth_two_factor_admin_read" ON "auth_two_factor" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
