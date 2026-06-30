-- docs/03 §4 + docs/08 §4 — Casino Management redesign.
--
-- Three things happen in this migration:
--
--   1. Replace the JSONB-in-site_content sub-category hack with a real
--      pair of tables: `casino_sub_categories` (the section, e.g.
--      Originals, Slots, Live Dealers) and `casino_sub_category_games`
--      (the per-section, per-game ordering). Player lobby and admin
--      Game Lobby editor both read from these.
--
--   2. Expand `aggregators` with the fields the senior dev will want
--      when wiring real integrations (AleaPlay, Marbles, etc.):
--      callback_url, webhook_secret_ref (Doppler key name only — never
--      the actual secret per .cursorrules), features jsonb, version,
--      last_seen_at, error_count_1h, plus a non-secret notes/contact.
--
--   3. Backfill from `site_content` `seed-cms-subcat-*` rows + each
--      game's existing `sub_category` / `category` text so the player
--      lobby keeps rendering its five rails immediately after this
--      migration runs. Idempotent — safe to re-run.

------------------------------------------------------------------------
-- 1) casino_sub_categories — the section definitions.
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "casino_sub_categories" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug"           text NOT NULL UNIQUE,
  "display_name"   text NOT NULL,
  "type"           text NOT NULL DEFAULT 'slots',
  "thumbnail_url"  text,
  "ordering"       integer NOT NULL DEFAULT 0,
  "status"         text NOT NULL DEFAULT 'active',
  "in_lobby"       boolean NOT NULL DEFAULT true,
  "is_featured"    boolean NOT NULL DEFAULT false,
  "metadata"       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_by"     uuid,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casino_sub_categories_status_check"
    CHECK ("status" IN ('active', 'inactive'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "casino_sub_categories_ordering_idx"
  ON "casino_sub_categories" ("ordering")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "casino_sub_categories_lobby_idx"
  ON "casino_sub_categories" ("ordering")
  WHERE "in_lobby" = true AND "status" = 'active';
--> statement-breakpoint

ALTER TABLE "casino_sub_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "casino_sub_categories_public_read" ON "casino_sub_categories" FOR SELECT
  USING ("status" = 'active' AND "in_lobby" = true);
--> statement-breakpoint

CREATE POLICY "casino_sub_categories_admin_read" ON "casino_sub_categories" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

------------------------------------------------------------------------
-- 2) casino_sub_category_games — the per-section ordering join.
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "casino_sub_category_games" (
  "sub_category_id" uuid NOT NULL REFERENCES "casino_sub_categories"("id") ON DELETE CASCADE,
  "game_id"         uuid NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "ordering"        integer NOT NULL DEFAULT 0,
  "added_by"        uuid,
  "added_at"        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("sub_category_id", "game_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "casino_sub_category_games_section_idx"
  ON "casino_sub_category_games" ("sub_category_id", "ordering");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "casino_sub_category_games_game_idx"
  ON "casino_sub_category_games" ("game_id");
--> statement-breakpoint

ALTER TABLE "casino_sub_category_games" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "casino_sub_category_games_public_read" ON "casino_sub_category_games" FOR SELECT
  USING (true);
--> statement-breakpoint

CREATE POLICY "casino_sub_category_games_admin_read" ON "casino_sub_category_games" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

------------------------------------------------------------------------
-- 3) Expand `aggregators` for senior-dev integration wiring.
--    All new columns are nullable / defaulted so existing rows are fine.
------------------------------------------------------------------------

ALTER TABLE "aggregators"
  ADD COLUMN IF NOT EXISTS "callback_url"        text,
  ADD COLUMN IF NOT EXISTS "webhook_secret_ref"  text,
  ADD COLUMN IF NOT EXISTS "features"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "version"             text,
  ADD COLUMN IF NOT EXISTS "last_seen_at"        timestamptz,
  ADD COLUMN IF NOT EXISTS "error_count_1h"      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "contact_email"       text,
  ADD COLUMN IF NOT EXISTS "notes"               text;
--> statement-breakpoint

------------------------------------------------------------------------
-- 4) Backfill. Idempotent — uses ON CONFLICT DO NOTHING / WHERE NOT
--    EXISTS so re-running the migration on a partially-migrated database
--    is safe.
--
-- Step 4a: seed the five default lobby sections from the player site
-- (Originals / Slots / Live Dealers / Game Shows / Live Games). These
-- match the player-side slugs already in apps/web/lib/player-categories.ts.
------------------------------------------------------------------------

INSERT INTO "casino_sub_categories"
  ("slug", "display_name", "type", "ordering", "status", "in_lobby")
VALUES
  ('originals',    'Originals',    'originals',    1, 'active', true),
  ('slots',        'Slots',        'slots',        2, 'active', true),
  ('live-dealers', 'Live Dealers', 'live-dealers', 3, 'active', true),
  ('game-shows',   'Game Shows',   'game-shows',   4, 'active', true),
  ('live-games',   'Live Games',   'live-games',   5, 'active', true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Step 4b: import any extra sub-categories that were created as JSONB
-- rows in site_content. The `value_json` column is jsonb but stores the
-- JSON value as a string (double-encoded), so we use `#>> '{}'` to
-- extract the raw text first then re-parse it as jsonb. We pull the
-- slug from the inner json so pretty seed keys like
-- 'seed-cms-subcat-originals' don't pollute the new slug column.
--
-- New extra sub-categories from site_content default to in_lobby=false
-- so they don't auto-appear in the player lobby — the operator opts
-- them in via the admin Sub Categories page. The five canonical
-- sections seeded above (step 4a) are NOT affected by ON CONFLICT.
INSERT INTO "casino_sub_categories"
  ("slug", "display_name", "type", "ordering", "status", "in_lobby")
SELECT
  COALESCE(
    NULLIF(((value_json #>> '{}')::jsonb)->>'slug', ''),
    replace(replace(key, 'seed-cms-subcat-', ''), '_', '-')
  ),
  COALESCE(
    NULLIF(((value_json #>> '{}')::jsonb)->>'displayName', ''),
    NULLIF(((value_json #>> '{}')::jsonb)->>'slug', ''),
    replace(replace(key, 'seed-cms-subcat-', ''), '_', '-')
  ),
  COALESCE(((value_json #>> '{}')::jsonb)->>'type', 'slots'),
  COALESCE((((value_json #>> '{}')::jsonb)->>'ordering')::int, 99),
  COALESCE(((value_json #>> '{}')::jsonb)->>'status', 'active'),
  false
FROM "site_content"
WHERE key LIKE 'seed-cms-subcat-%'
  AND value_json IS NOT NULL
  AND (value_json #>> '{}') ~ '^\s*\{'  -- guard against null / non-object JSON
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Step 4c: link every active game into the sub_category that matches
-- its current `category` text. Falls back to 'originals' for anything
-- unmatched, which mirrors the toPlayerCategory() default in
-- apps/web/lib/player-categories.ts.
--
-- The per-section ordering uses the game's existing lobby_order (or 0)
-- so the visual order doesn't shuffle the moment we cut over.
INSERT INTO "casino_sub_category_games" ("sub_category_id", "game_id", "ordering")
SELECT
  sc.id,
  g.id,
  COALESCE(g.lobby_order, 0)
FROM "games" g
JOIN "casino_sub_categories" sc ON sc."slug" = (
  CASE lower(COALESCE(g.category, ''))
    WHEN 'slots'         THEN 'slots'
    WHEN 'slot'          THEN 'slots'
    WHEN 'originals'     THEN 'originals'
    WHEN 'original'      THEN 'originals'
    WHEN 'crash'         THEN 'originals'
    WHEN 'table'         THEN 'originals'
    WHEN 'card'          THEN 'originals'
    WHEN 'instant'       THEN 'originals'
    WHEN 'live-dealer'   THEN 'live-dealers'
    WHEN 'live-dealers'  THEN 'live-dealers'
    WHEN 'live-casino'   THEN 'live-dealers'
    WHEN 'live'          THEN 'live-dealers'
    WHEN 'game-show'     THEN 'game-shows'
    WHEN 'game-shows'    THEN 'game-shows'
    WHEN 'gameshow'      THEN 'game-shows'
    WHEN 'live-game'     THEN 'live-games'
    WHEN 'live-games'    THEN 'live-games'
    ELSE 'originals'
  END
)
WHERE g.deleted_at IS NULL
  AND g.status = 'active'
ON CONFLICT ("sub_category_id", "game_id") DO NOTHING;
--> statement-breakpoint
