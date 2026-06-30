-- docs/06 §13 — two changes that go together:
--
--   1. Rework the Daily Login bonus to 10,000 GC + 1 SC with a true
--      24h rolling cooldown (was 5,000 SC + 20h, anchored to UTC
--      midnight in the player API). Updates the existing template row
--      so running databases get the new values without re-seeding.
--
--   2. Add a 'pending' status to `bonuses_awarded`. A pending award
--      has been granted but no ledger entry has been written yet; the
--      coins arrive only when the player explicitly claims it from
--      the Available Rewards popover. Used for admin-granted bonuses
--      (3x playthrough default), affiliate payouts from Frenzy
--      Creator (0x playthrough, immediate), and any other "show up in
--      the player's inbox" reward path. The engine treats pending
--      rows as not-yet-awarded for cooldown/stacking checks but does
--      track them for max_per_player.

------------------------------------------------------------------------
-- 1) Daily bonus reshape — 10,000 GC + 1 SC every 24h (rolling).
------------------------------------------------------------------------
UPDATE "bonuses"
SET
  "display_name" = 'Daily Login Bonus',
  "award_gc"     = 10000,        -- 10,000 GC major units
  "award_sc"     = 1,            -- 1 SC major unit
  "cooldown_hours" = 24,         -- exact 24h rolling cooldown
  "description"  = 'Claim every 24 hours. 10,000 GC + 1 SC each time.',
  "updated_at"   = now()
WHERE "slug" = 'daily_login';

------------------------------------------------------------------------
-- 2) Add 'pending' to the bonuses_awarded status check constraint.
--    Postgres doesn't let us ALTER an existing CHECK in place, so we
--    drop and re-add with the new set of allowed values.
------------------------------------------------------------------------
ALTER TABLE "bonuses_awarded" DROP CONSTRAINT IF EXISTS "bonuses_awarded_status_check";

ALTER TABLE "bonuses_awarded"
  ADD CONSTRAINT "bonuses_awarded_status_check"
  CHECK ("status" IN ('pending', 'active', 'completed', 'expired', 'forfeited', 'reversed'));

-- Index pending rows for the per-player popover query. The popover hits
-- this every time it opens, so we want it indexed.
CREATE INDEX IF NOT EXISTS "bonuses_awarded_pending_idx"
  ON "bonuses_awarded" ("player_id", "created_at" DESC)
  WHERE "status" = 'pending';

------------------------------------------------------------------------
-- 3) Templates for the two pending-claim feeders the popover supports:
--      - Frenzy Creator affiliate payouts (0x playthrough, immediate)
--      - Admin-granted bonuses (default 3x SC playthrough, admin can
--        override per-grant via playthroughMultiplierOverride)
--    Both are stackable so a player can have multiple pending rows at
--    once (e.g. one payout + a bonus code redemption sitting in the
--    inbox).
------------------------------------------------------------------------
INSERT INTO "bonuses"
  (slug, display_name, bonus_type, award_gc, award_sc, award_formula,
   playthrough_multiplier, playthrough_window_hours,
   min_bet_for_contribution, max_bet_during_playthrough,
   max_per_player, cooldown_hours, stackable, status, description)
VALUES
  ('affiliate_payout_default', 'Frenzy Creator Payout', 'affiliate',
   0, 0, NULL,
   0.0, NULL, NULL, NULL, NULL, NULL, true, 'active',
   'Affiliate payout from the Frenzy Creator program. No playthrough — redeemable immediately.'),
  ('admin_grant_default',      'Bonus Grant',           'promotion',
   0, 0, NULL,
   3.0, NULL, NULL, NULL, NULL, NULL, true, 'active',
   'Bonus sent by support / promotions. Default 3x playthrough; admin can override per grant.')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
