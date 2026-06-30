-- docs/09 §5.1 + docs/09 §7 — Better Auth player session tables and the
-- responsible-gaming "pending limit changes" queue.
--
-- Better Auth manages the player authentication identity (email/password,
-- magic-link, optional TOTP). Player domain data still lives in `players`;
-- auth_user.id and players.id share the same string UUID so the join is
-- trivial.
--
-- The casino app already has `players.rg_deposit_limit_*` and
-- `players.rg_session_limit_min`. The new `player_limit_changes` table is
-- the 24-hour delay queue per docs/09 §7.2 — limit increases sit here until
-- maturity, then a cron promotes them into the players row.

CREATE TABLE IF NOT EXISTS "auth_user" (
  "id"             text PRIMARY KEY,
  "email"          text NOT NULL,
  "email_verified" boolean NOT NULL DEFAULT false,
  "name"           text,
  "image"          text,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "auth_user_email_unique" UNIQUE ("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_user_email_idx" ON "auth_user" (lower("email"));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_session" (
  "id"         text PRIMARY KEY,
  "user_id"    text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "token"      text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "auth_session_token_unique" UNIQUE ("token")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_user_idx" ON "auth_session" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_expires_idx" ON "auth_session" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_account" (
  "id"                       text PRIMARY KEY,
  "user_id"                  text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "account_id"               text NOT NULL,
  "provider_id"              text NOT NULL,
  "password"                 text,
  "access_token"             text,
  "refresh_token"            text,
  "id_token"                 text,
  "access_token_expires_at"  timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope"                    text,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_account_user_idx" ON "auth_account" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_account_provider_idx" ON "auth_account" ("provider_id", "account_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_verification" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_verification_identifier_idx" ON "auth_verification" ("identifier");
--> statement-breakpoint

-- ============================================================================
-- player_limit_changes — the 24-hour deposit-limit-increase delay queue.
-- docs/09 §7.2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "player_limit_changes" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "player_id"     uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "limit_kind"    text NOT NULL,
  "previous_value" text,
  "next_value"    text NOT NULL,
  "direction"     text NOT NULL CHECK ("direction" IN ('increase', 'decrease')),
  "requested_at"  timestamptz NOT NULL DEFAULT now(),
  "apply_at"      timestamptz NOT NULL,
  "applied_at"    timestamptz,
  "cancelled_at"  timestamptz,
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_limit_changes_player_idx"
  ON "player_limit_changes" ("player_id", "requested_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_limit_changes_pending_idx"
  ON "player_limit_changes" ("apply_at")
  WHERE "applied_at" IS NULL AND "cancelled_at" IS NULL;
--> statement-breakpoint

-- ============================================================================
-- RLS on the new player-owned tables. Auth tables stay open to the service
-- role (Better Auth manages them server-side only); player_limit_changes is
-- player-scoped via app.actor_id.
-- ============================================================================

ALTER TABLE "auth_user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_verification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "player_limit_changes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Player can read their own auth_user row.
CREATE POLICY "auth_user_self_read" ON "auth_user" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND "id" = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "auth_user_admin_read" ON "auth_user" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "auth_session_self_read" ON "auth_session" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND "user_id" = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "auth_session_admin_read" ON "auth_session" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "player_limit_changes_player_read" ON "player_limit_changes" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND "player_id"::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "player_limit_changes_admin_read" ON "player_limit_changes" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
