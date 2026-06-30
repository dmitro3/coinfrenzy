-- docs/03 §5.4 — packages overhaul.
--
-- Adds the operator-facing surfaces missing from the original packages
-- table:
--   1. Separate playthrough multipliers for base SC vs bonus SC (the
--      operator's existing model — base SC clears at 1x, bonus SC at 3x
--      — and the same split for GC so a "bonus GC" portion can carry a
--      different playthrough).
--   2. Featured-slot promo placement: at most one package each in slot 1
--      and slot 2, shown as banner cards on top of the player shop.
--   3. Banner copy fields (headline, subhead, image, badge color) so
--      promotional packages can render as real banners, not just a tiny
--      "promotional_label" string.
--   4. Welcome + post-welcome package seed matching the existing Gamma
--      operator's bundles. We seed conservatively (ON CONFLICT (slug)
--      DO NOTHING) so re-running is safe.

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "bonus_sc_playthrough_multiplier"
    numeric(5, 2) NOT NULL DEFAULT 3.0;
--> statement-breakpoint

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "bonus_gc_playthrough_multiplier"
    numeric(5, 2) NOT NULL DEFAULT 1.0;
--> statement-breakpoint

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "featured_slot" integer;
--> statement-breakpoint

ALTER TABLE "packages"
  ADD CONSTRAINT "packages_featured_slot_range"
    CHECK ("featured_slot" IS NULL OR "featured_slot" IN (1, 2));
--> statement-breakpoint

-- Each featured slot can have at most ONE occupant among live (non-deleted)
-- packages. Inactive featured packages don't take a slot.
CREATE UNIQUE INDEX IF NOT EXISTS "packages_featured_slot_unique"
  ON "packages"("featured_slot")
  WHERE "featured_slot" IS NOT NULL
    AND "deleted_at" IS NULL
    AND "status" = 'active';
--> statement-breakpoint

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "badge_color" text;
--> statement-breakpoint

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "banner_headline" text;
--> statement-breakpoint

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "banner_subhead" text;
--> statement-breakpoint

ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "banner_image_url" text;
--> statement-breakpoint

-- -------------------------------------------------------------------------
-- Seed welcome packages (shown ONLY to players who haven't purchased yet).
-- -------------------------------------------------------------------------
-- Operator's existing Gamma model:
--   $10  → 30 SC total  (10 base @ 1x  + 20 bonus @ 3x), 30,000 GC
--   $25  → 50 SC total  (25 base @ 1x  + 25 bonus @ 3x), 50,000 GC
--   $50  → 100 SC total (50 base + 50 bonus),            100,000 GC
--   $100 → 150 SC total (100 base + 50 bonus),           150,000 GC
--   $250 → 300 SC total (250 base + 50 bonus),           300,000 GC
--   $500 → 600 SC total (500 base + 100 bonus),          600,000 GC
--   $1000 → 1100 SC     (1000 base + 100 bonus),         1,100,000 GC
--
-- GC is always 1000× the SC total (so 30 SC ⇒ 30k GC). The base GC matches
-- price-major (10k for $10), the bonus GC is whatever remains.
-- All amounts are money(numeric 20,4) — multiplied by 10000 below.
-- Cast the 10000 factor to numeric so the multiplication happens in numeric;
-- with int4 alone, base_gc values for the $250+ bundles overflow.

INSERT INTO "packages"
  (slug, display_name, price_usd, base_gc, bonus_gc, base_sc, bonus_sc,
   playthrough_multiplier, bonus_sc_playthrough_multiplier,
   bonus_gc_playthrough_multiplier,
   sort_order, status, first_purchase_only, promotional_label, badge_color)
VALUES
  ('welcome-10',  'Welcome $10 Bundle',  10     * 10000::numeric,
     10000  * 10000::numeric, 20000  * 10000::numeric,
     10     * 10000::numeric, 20     * 10000::numeric,
     1.00, 3.00, 1.00, 10, 'active', true, 'Welcome', 'gold'),
  ('welcome-25',  'Welcome $25 Bundle',  25     * 10000::numeric,
     25000  * 10000::numeric, 25000  * 10000::numeric,
     25     * 10000::numeric, 25     * 10000::numeric,
     1.00, 3.00, 1.00, 20, 'active', true, 'Welcome', 'gold'),
  ('welcome-50',  'Welcome $50 Bundle',  50     * 10000::numeric,
     50000  * 10000::numeric, 50000  * 10000::numeric,
     50     * 10000::numeric, 50     * 10000::numeric,
     1.00, 3.00, 1.00, 30, 'active', true, 'Welcome', 'gold'),
  ('welcome-100', 'Welcome $100 Bundle', 100    * 10000::numeric,
     100000 * 10000::numeric, 50000  * 10000::numeric,
     100    * 10000::numeric, 50     * 10000::numeric,
     1.00, 3.00, 1.00, 40, 'active', true, 'Welcome', 'gold'),
  ('welcome-250', 'Welcome $250 Bundle', 250    * 10000::numeric,
     250000 * 10000::numeric, 50000  * 10000::numeric,
     250    * 10000::numeric, 50     * 10000::numeric,
     1.00, 3.00, 1.00, 50, 'active', true, 'Welcome', 'gold'),
  ('welcome-500', 'Welcome $500 Bundle', 500    * 10000::numeric,
     500000 * 10000::numeric, 100000 * 10000::numeric,
     500    * 10000::numeric, 100    * 10000::numeric,
     1.00, 3.00, 1.00, 60, 'active', true, 'Welcome', 'gold'),
  ('welcome-1000', 'Welcome $1000 Bundle', 1000  * 10000::numeric,
     1000000 * 10000::numeric, 100000 * 10000::numeric,
     1000    * 10000::numeric, 100    * 10000::numeric,
     1.00, 3.00, 1.00, 70, 'active', true, 'Welcome', 'gold')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- -------------------------------------------------------------------------
-- Seed standard packages (shown ONLY to players who've purchased at least
-- once). The 1:1 split — no bonus — matches the operator's Gamma model.
-- -------------------------------------------------------------------------

INSERT INTO "packages"
  (slug, display_name, price_usd, base_gc, bonus_gc, base_sc, bonus_sc,
   playthrough_multiplier, bonus_sc_playthrough_multiplier,
   bonus_gc_playthrough_multiplier,
   sort_order, status, first_purchase_only, promotional_label)
VALUES
  ('std-10',   'Starter $10 Bundle',   10    * 10000::numeric,
     10000   * 10000::numeric, 0,
     10      * 10000::numeric, 0,
     1.00, 1.00, 1.00, 110, 'active', false, NULL),
  ('std-25',   'Bronze $25 Bundle',    25    * 10000::numeric,
     25000   * 10000::numeric, 0,
     25      * 10000::numeric, 0,
     1.00, 1.00, 1.00, 120, 'active', false, NULL),
  ('std-50',   'Silver $50 Bundle',    50    * 10000::numeric,
     50000   * 10000::numeric, 0,
     50      * 10000::numeric, 0,
     1.00, 1.00, 1.00, 130, 'active', false, NULL),
  ('std-100',  'Gold $100 Bundle',    100    * 10000::numeric,
     100000  * 10000::numeric, 0,
     100     * 10000::numeric, 0,
     1.00, 1.00, 1.00, 140, 'active', false, NULL),
  ('std-250',  'Platinum $250 Bundle', 250   * 10000::numeric,
     250000  * 10000::numeric, 0,
     250     * 10000::numeric, 0,
     1.00, 1.00, 1.00, 150, 'active', false, NULL),
  ('std-500',  'Diamond $500 Bundle',  500   * 10000::numeric,
     500000  * 10000::numeric, 0,
     500     * 10000::numeric, 0,
     1.00, 1.00, 1.00, 160, 'active', false, NULL),
  ('std-1000', 'Champion $1000 Bundle', 1000 * 10000::numeric,
     1000000 * 10000::numeric, 0,
     1000    * 10000::numeric, 0,
     1.00, 1.00, 1.00, 170, 'active', false, NULL)
ON CONFLICT (slug) DO NOTHING;
