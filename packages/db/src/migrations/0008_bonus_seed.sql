-- docs/06 §3 + §13 — seed singleton bonus templates for the trigger sites
-- that resolve by slug (welcome, daily login, AMOE, tier_up, jackpot, etc.).
-- Operators edit amount/multiplier/window via the admin UI; the slug is the
-- stable handle code uses.
-- Idempotent: ON CONFLICT (slug) DO NOTHING.

INSERT INTO "bonuses"
  (slug, display_name, bonus_type, award_gc, award_sc, award_formula,
   playthrough_multiplier, playthrough_window_hours,
   min_bet_for_contribution, max_bet_during_playthrough,
   max_per_player, cooldown_hours, stackable, status, description)
VALUES
  -- Welcome — first completed purchase. Variable per package via formula
  -- (20% of purchase amount as SC); 3x playthrough; 7-day window.
  ('welcome_default',       'Welcome Bonus',         'welcome',
   0, 0, '{"type":"pct_of_purchase","pct":0.20,"currency":"SC"}',
   3.0, 168, 10000, 100000, 1, NULL, false, 'active',
   'One-time welcome bonus on your first purchase.'),

  -- Daily login — 10,000 GC + 1 SC every 24 hours (rolling). Cooldown
  -- is enforced by the bonus engine off the last award timestamp, so
  -- the next claim becomes available 24h after the most recent claim
  -- to the second (see docs/06 §4 "Cooldown check").
  ('daily_login',           'Daily Login Bonus',     'daily',
   10000, 1, NULL,
   1.0, 24, NULL, NULL, NULL, 24, false, 'active',
   'Claim every 24 hours. 10,000 GC + 1 SC each time.'),

  -- AMOE — fixed $1 SC = 10000 minor units; 1x playthrough; 30-day window.
  -- max_per_player NULL: unlimited (the per-day cap is enforced by the
  -- EasyScam adapter, not the bonus engine).
  ('amoe_default',          'AMOE — Mail-in Entry',  'amoe',
   0, 10000, NULL,
   1.0, 720, NULL, NULL, NULL, NULL, true, 'active',
   'Free entry method via mail-in. Subject to terms.'),

  -- Tier up — variable per tier via formula (we use a 6-row table keyed on
  -- the level the player reached); 3x playthrough; 14-day window.
  ('tier_up_default',       'Tier Up Bonus',         'tier_up',
   0, 0,
   '{"type":"tier_match","tier_table":{"1":{"sc":0},"2":{"sc":10000},"3":{"sc":50000},"4":{"sc":250000},"5":{"sc":1000000},"6":{"sc":5000000}}}',
   3.0, 336, NULL, NULL, NULL, NULL, true, 'active',
   'Awarded when you advance to a new tier.'),

  -- Weekly tier — uses the tier_progress row to determine award amount.
  ('weekly_tier_default',   'Weekly Tier Bonus',     'weekly_tier',
   0, 0,
   '{"type":"tier_match","tier_table":{"1":{"sc":0},"2":{"sc":10000},"3":{"sc":50000},"4":{"sc":250000},"5":{"sc":1000000},"6":{"sc":5000000}}}',
   1.0, 168, NULL, NULL, NULL, 167, true, 'active',
   'Weekly bonus scaled by tier.'),

  -- Monthly tier.
  ('monthly_tier_default',  'Monthly Tier Bonus',    'monthly_tier',
   0, 0,
   '{"type":"tier_match","tier_table":{"1":{"sc":0},"2":{"sc":50000},"3":{"sc":250000},"4":{"sc":1000000},"5":{"sc":5000000},"6":{"sc":25000000}}}',
   1.0, 720, NULL, NULL, NULL, 719, true, 'active',
   'Monthly bonus scaled by tier.'),

  -- Jackpot — fixed SC; 5x playthrough; 14-day window. Triggered when a
  -- single win exceeds the big-win threshold (Doc 05/06).
  ('jackpot_default',       'Jackpot Bonus',         'jackpot',
   0, 100000, NULL,
   5.0, 336, NULL, NULL, NULL, NULL, true, 'active',
   'Bonus awarded for hitting a big win.'),

  -- Referral — fixed SC; 3x; 30-day window.
  ('referral_default',      'Referral Bonus',        'referral',
   0, 50000, NULL,
   3.0, 720, NULL, NULL, NULL, NULL, true, 'active',
   'Awarded when a referred friend makes their first purchase.')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
