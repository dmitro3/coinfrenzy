-- docs/03 §4 — repair the backfill done by migration 0012 on databases
-- where 0012 ran before its bugfix.
--
-- Bug: `site_content.value_json` is `jsonb` but stores the JSON as a
-- string (double-encoded). The original `value_json->>'displayName'`
-- returned NULL, so any extra sub-categories imported from
-- `site_content` ended up with display names like
-- `seed-cms-subcat-table-games`. We also unconditionally set
-- `in_lobby=true` for those, which is too aggressive — the operator
-- should opt them in via the admin Sub Categories page.
--
-- This migration:
--   1. Re-extracts displayName/type/ordering/status from `site_content`
--      using the correct `(value_json #>> '{}')::jsonb` pattern and
--      patches the existing rows.
--   2. Hides the imported extras from the player lobby by default by
--      setting `in_lobby = false` (admin can re-enable).
--   3. Leaves the five canonical sections (originals/slots/etc.) alone.

UPDATE "casino_sub_categories" sc
SET
  "display_name" = COALESCE(
    NULLIF(((src.value_json #>> '{}')::jsonb)->>'displayName', ''),
    sc.display_name
  ),
  "type" = COALESCE(((src.value_json #>> '{}')::jsonb)->>'type', sc.type),
  "ordering" = COALESCE(
    (((src.value_json #>> '{}')::jsonb)->>'ordering')::int,
    sc.ordering
  ),
  "status" = COALESCE(((src.value_json #>> '{}')::jsonb)->>'status', sc.status),
  "in_lobby" = false,
  "updated_at" = now()
FROM "site_content" src
WHERE src.key LIKE 'seed-cms-subcat-%'
  AND src.value_json IS NOT NULL
  AND (src.value_json #>> '{}') ~ '^\s*\{'
  AND sc.slug = COALESCE(
    NULLIF(((src.value_json #>> '{}')::jsonb)->>'slug', ''),
    replace(replace(src.key, 'seed-cms-subcat-', ''), '_', '-')
  )
  AND sc.slug NOT IN ('originals', 'slots', 'live-dealers', 'game-shows', 'live-games');
--> statement-breakpoint
