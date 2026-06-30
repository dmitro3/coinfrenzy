-- docs/09 §3.7 + docs/01 §legal — versioned terms-of-service acceptance.
--
-- Two new pieces:
--
-- 1. `terms_versions` — append-only catalog of published TOS/Privacy
--    documents. The "current" version of a slug is the most recent row.
--    Admin actions (publish) write rows here; nothing else writes.
--
-- 2. `players.tos_accepted_version` / `tos_accepted_at` — last-accepted
--    snapshot for each player. When the current version exceeds the
--    accepted version, the player shell shows the acceptance banner and
--    blocks money-moving actions until acceptance.
--
-- Seeded with a starter version (v1) so existing players are immediately
-- accepted against the current document — no surprise banner on day 1.

CREATE TABLE IF NOT EXISTS "terms_versions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug"          text NOT NULL,
  "version"       integer NOT NULL,
  "title"         text NOT NULL,
  "body_html"     text NOT NULL,
  "summary"       text,
  "effective_at"  timestamptz NOT NULL DEFAULT now(),
  "created_by"    uuid,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "terms_versions_slug_version_unique" UNIQUE ("slug", "version"),
  CONSTRAINT "terms_versions_slug_check" CHECK (slug IN ('tos', 'privacy', 'rg_policy'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "terms_versions_slug_effective_idx"
  ON "terms_versions" (slug, effective_at DESC);
--> statement-breakpoint

ALTER TABLE "terms_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "terms_versions_public_read" ON "terms_versions" FOR SELECT
  USING (true);
--> statement-breakpoint

CREATE POLICY "terms_versions_admin_write" ON "terms_versions" FOR ALL
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'))
  WITH CHECK (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

-- Append the player columns.
ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "tos_accepted_version" integer,
  ADD COLUMN IF NOT EXISTS "tos_accepted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "privacy_accepted_version" integer,
  ADD COLUMN IF NOT EXISTS "privacy_accepted_at" timestamptz;
--> statement-breakpoint

-- Seed the starter v1 for TOS + Privacy so existing players are auto-current.
INSERT INTO "terms_versions" ("slug", "version", "title", "body_html", "summary")
VALUES
  ('tos', 1, 'Terms of Service v1', '<p>Initial Terms of Service. Bump via admin to require re-acceptance.</p>', 'Initial terms — set up via admin.'),
  ('privacy', 1, 'Privacy Policy v1', '<p>Initial Privacy Policy. Bump via admin to require re-acceptance.</p>', 'Initial privacy policy — set up via admin.')
ON CONFLICT (slug, version) DO NOTHING;
--> statement-breakpoint

-- Mark every existing player as having accepted v1 (one-time backfill).
UPDATE "players"
SET "tos_accepted_version" = 1,
    "tos_accepted_at" = COALESCE(tos_accepted_at, created_at),
    "privacy_accepted_version" = 1,
    "privacy_accepted_at" = COALESCE(privacy_accepted_at, created_at)
WHERE "tos_accepted_version" IS NULL;
--> statement-breakpoint
