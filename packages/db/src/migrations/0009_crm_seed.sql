-- docs/11 §5.4 + §6 — seed the 6 canonical CRM flows + their starter
-- email and SMS templates. All idempotent via ON CONFLICT (slug).
--
-- These exist from day one of the platform per docs/11 §5.4. Operators
-- edit the templates via the admin UI; the slugs are the stable handles
-- the flow steps reference.

-- ---- email templates -----------------------------------------------------

INSERT INTO "email_templates"
  (slug, display_name, version, is_current,
   subject_template, body_html_template, body_text_template,
   from_email, category)
VALUES
  -- Welcome series
  ('welcome_1_intro', 'Welcome — Email 1: Intro', 1, true,
   'Welcome to CoinFrenzy, {{player.displayName}}!',
   '<h1>Welcome aboard!</h1><p>Hi {{player.displayName}}, your account is ready. Verify your email to claim your first reward.</p>',
   'Welcome to CoinFrenzy, {{player.displayName}}! Verify your email to claim your first reward.',
   'noreply@coinfrenzy.com', 'lifecycle'),

  ('welcome_2_first_purchase', 'Welcome — Email 2: First purchase', 1, true,
   'Get started with your first coin pack',
   '<h1>Ready to play?</h1><p>Pick a starter pack — your welcome bonus is waiting.</p>',
   'Pick a starter pack — your welcome bonus is waiting.',
   'noreply@coinfrenzy.com', 'lifecycle'),

  ('welcome_3_kyc', 'Welcome — Email 3: Verify identity', 1, true,
   'Verify your identity to unlock cash redemptions',
   '<h1>Unlock cash redemptions</h1><p>Quick ID check via Footprint takes about 2 minutes.</p>',
   'Verify your identity to unlock cash redemptions.',
   'noreply@coinfrenzy.com', 'lifecycle'),

  ('welcome_4_second_purchase', 'Welcome — Email 4: Second purchase', 1, true,
   '20% bonus on your next pack',
   '<h1>Double the play</h1><p>Use code REPLAY at checkout for 20% extra coins.</p>',
   'Use code REPLAY at checkout for 20% extra coins.',
   'noreply@coinfrenzy.com', 'lifecycle'),

  ('welcome_5_engagement', 'Welcome — Email 5: Engagement', 1, true,
   'Top games this week',
   '<h1>Week-1 favorites</h1><p>Try these crowd-favorite games — fresh weekly picks.</p>',
   'Try these crowd-favorite games — fresh weekly picks.',
   'noreply@coinfrenzy.com', 'lifecycle'),

  -- Cart abandonment
  ('cart_recovery', 'Cart Recovery', 1, true,
   'Your coins are still waiting',
   '<h1>Pick up where you left off</h1><p>Your cart is still saved. Tap below to complete checkout.</p>',
   'Your cart is still saved. Tap to complete checkout.',
   'noreply@coinfrenzy.com', 'recovery'),

  -- Lapsed reactivation
  ('lapsed_we_miss_you', 'Lapsed — We miss you', 1, true,
   'We miss you, {{player.displayName}}',
   '<h1>Come back, {{player.displayName}}</h1><p>Your last visit was {{player.lastLoginRelative}}. Here is a free 0.50 SC to play.</p>',
   'Come back! Here is a free 0.50 SC to play.',
   'noreply@coinfrenzy.com', 'reactivation'),

  -- KYC nudge
  ('kyc_nudge_3d', 'KYC nudge (3 days)', 1, true,
   'Quick ID check unlocks cash redemptions',
   '<h1>One more step</h1><p>Verify your identity to redeem your winnings — takes 2 minutes.</p>',
   'Verify your identity to redeem your winnings.',
   'noreply@coinfrenzy.com', 'lifecycle'),

  -- Big win
  ('big_win_celebration', 'Big Win Celebration', 1, true,
   'Big win! {{player.displayName}}',
   '<h1>Congrats on your big win!</h1><p>You just won big. Share the moment with friends!</p>',
   'Congrats on your big win!',
   'noreply@coinfrenzy.com', 'engagement'),

  -- Tier up
  ('tier_up_celebration', 'Tier Up Celebration', 1, true,
   'You reached {{player.tierName}}!',
   '<h1>Welcome to {{player.tierName}}</h1><p>Enjoy your new perks: bigger weekly bonus, faster redemptions, more.</p>',
   'You reached {{player.tierName}} — enjoy the new perks!',
   'noreply@coinfrenzy.com', 'engagement')
ON CONFLICT (slug) DO NOTHING;

--> statement-breakpoint

-- ---- SMS templates -------------------------------------------------------

INSERT INTO "sms_templates"
  (slug, display_name, version, is_current, body_template, category)
VALUES
  ('cart_recovery_sms', 'Cart Recovery (SMS)', 1, true,
   'CoinFrenzy: Your cart is still waiting. Reply STOP to opt out.',
   'recovery'),
  ('lapsed_we_miss_you_sms', 'Lapsed — We miss you (SMS)', 1, true,
   'CoinFrenzy: We miss you {{player.displayName}}! Come back for a free 0.50 SC. STOP to opt out.',
   'reactivation'),
  ('kyc_nudge_7d_sms', 'KYC nudge (7d, SMS)', 1, true,
   'CoinFrenzy: Verify your ID to redeem your wins. STOP to opt out.',
   'lifecycle'),
  ('big_win_sms', 'Big Win SMS', 1, true,
   'CoinFrenzy: Big win! Congrats {{player.displayName}}. STOP to opt out.',
   'engagement')
ON CONFLICT (slug) DO NOTHING;

--> statement-breakpoint

-- ---- The 6 canonical flows -----------------------------------------------

DO $$
DECLARE
  welcome_id   uuid;
  cart_id      uuid;
  lapsed_id    uuid;
  kyc_id       uuid;
  big_win_id   uuid;
  tier_up_id   uuid;
BEGIN

-- Welcome Series
INSERT INTO "crm_flows" (name, description, trigger_event, max_enrollments_per_player, status)
VALUES (
  'Welcome Series',
  '5 emails over 14 days. Educates, drives first deposit, awards welcome bonus, drives KYC.',
  'player.signup',
  1,
  'active'
)
ON CONFLICT DO NOTHING
RETURNING id INTO welcome_id;

IF welcome_id IS NULL THEN
  SELECT id INTO welcome_id FROM crm_flows WHERE name = 'Welcome Series' LIMIT 1;
END IF;

DELETE FROM crm_flow_steps WHERE flow_id = welcome_id;
INSERT INTO crm_flow_steps (flow_id, step_number, action_type, config, wait_duration_seconds) VALUES
  (welcome_id, 1, 'send_email', '{"templateSlug":"welcome_1_intro"}', NULL),
  (welcome_id, 2, 'wait',       '{}', 86400),
  (welcome_id, 3, 'send_email', '{"templateSlug":"welcome_2_first_purchase"}', NULL),
  (welcome_id, 4, 'wait',       '{}', 259200),
  (welcome_id, 5, 'send_email', '{"templateSlug":"welcome_3_kyc"}', NULL),
  (welcome_id, 6, 'wait',       '{}', 259200),
  (welcome_id, 7, 'send_email', '{"templateSlug":"welcome_4_second_purchase"}', NULL),
  (welcome_id, 8, 'wait',       '{}', 432000),
  (welcome_id, 9, 'send_email', '{"templateSlug":"welcome_5_engagement"}', NULL),
  (welcome_id, 10,'end',        '{}', NULL);

-- Cart Abandonment
INSERT INTO "crm_flows" (name, description, trigger_event, max_enrollments_per_player, status)
VALUES (
  'Cart Abandonment',
  'Trigger: player.purchase.cancelled. Email within 1h, SMS within 24h, discount within 48h.',
  'player.purchase.cancelled',
  3,
  'active'
)
ON CONFLICT DO NOTHING
RETURNING id INTO cart_id;
IF cart_id IS NULL THEN
  SELECT id INTO cart_id FROM crm_flows WHERE name = 'Cart Abandonment' LIMIT 1;
END IF;

DELETE FROM crm_flow_steps WHERE flow_id = cart_id;
INSERT INTO crm_flow_steps (flow_id, step_number, action_type, config, wait_duration_seconds) VALUES
  (cart_id, 1, 'wait',       '{}', 3600),
  (cart_id, 2, 'send_email', '{"templateSlug":"cart_recovery"}', NULL),
  (cart_id, 3, 'wait',       '{}', 82800),
  (cart_id, 4, 'send_sms',   '{"templateSlug":"cart_recovery_sms"}', NULL),
  (cart_id, 5, 'end',        '{}', NULL);

-- Lapsed Reactivation
INSERT INTO "crm_flows" (name, description, trigger_event, max_enrollments_per_player, status)
VALUES (
  'Lapsed Reactivation',
  'Cron-evaluated daily. Targets players inactive 14+ days who deposited at least once. Email + SMS.',
  'cron.daily.lapsed_check',
  4,
  'active'
)
ON CONFLICT DO NOTHING
RETURNING id INTO lapsed_id;
IF lapsed_id IS NULL THEN
  SELECT id INTO lapsed_id FROM crm_flows WHERE name = 'Lapsed Reactivation' LIMIT 1;
END IF;

DELETE FROM crm_flow_steps WHERE flow_id = lapsed_id;
INSERT INTO crm_flow_steps (flow_id, step_number, action_type, config, wait_duration_seconds) VALUES
  (lapsed_id, 1, 'send_email', '{"templateSlug":"lapsed_we_miss_you"}', NULL),
  (lapsed_id, 2, 'wait',       '{}', 172800),
  (lapsed_id, 3, 'send_sms',   '{"templateSlug":"lapsed_we_miss_you_sms"}', NULL),
  (lapsed_id, 4, 'end',        '{}', NULL);

-- KYC Nudge
INSERT INTO "crm_flows" (name, description, trigger_event, max_enrollments_per_player, status)
VALUES (
  'KYC Nudge',
  '3 days post-signup if KYC not started: email. + 7 days: SMS.',
  'player.signup',
  1,
  'active'
)
ON CONFLICT DO NOTHING
RETURNING id INTO kyc_id;
IF kyc_id IS NULL THEN
  SELECT id INTO kyc_id FROM crm_flows WHERE name = 'KYC Nudge' LIMIT 1;
END IF;

DELETE FROM crm_flow_steps WHERE flow_id = kyc_id;
INSERT INTO crm_flow_steps (flow_id, step_number, action_type, config, wait_duration_seconds) VALUES
  (kyc_id, 1, 'wait',       '{}', 259200),
  (kyc_id, 2, 'send_email', '{"templateSlug":"kyc_nudge_3d"}', NULL),
  (kyc_id, 3, 'wait',       '{}', 345600),
  (kyc_id, 4, 'send_sms',   '{"templateSlug":"kyc_nudge_7d_sms"}', NULL),
  (kyc_id, 5, 'end',        '{}', NULL);

-- Big Win Celebration
INSERT INTO "crm_flows" (name, description, trigger_event, max_enrollments_per_player, status)
VALUES (
  'Big Win Celebration',
  'Trigger: player.game.big_win. Email within 5 minutes, SMS optional.',
  'player.game.big_win',
  10,
  'active'
)
ON CONFLICT DO NOTHING
RETURNING id INTO big_win_id;
IF big_win_id IS NULL THEN
  SELECT id INTO big_win_id FROM crm_flows WHERE name = 'Big Win Celebration' LIMIT 1;
END IF;

DELETE FROM crm_flow_steps WHERE flow_id = big_win_id;
INSERT INTO crm_flow_steps (flow_id, step_number, action_type, config, wait_duration_seconds) VALUES
  (big_win_id, 1, 'wait',       '{}', 300),
  (big_win_id, 2, 'send_email', '{"templateSlug":"big_win_celebration"}', NULL),
  (big_win_id, 3, 'send_sms',   '{"templateSlug":"big_win_sms"}', NULL),
  (big_win_id, 4, 'end',        '{}', NULL);

-- Tier-Up Celebration
INSERT INTO "crm_flows" (name, description, trigger_event, max_enrollments_per_player, status)
VALUES (
  'Tier-Up Celebration',
  'Trigger: player.tier.up. Email + push within 10 minutes. Highlights new perks.',
  'player.tier.up',
  20,
  'active'
)
ON CONFLICT DO NOTHING
RETURNING id INTO tier_up_id;
IF tier_up_id IS NULL THEN
  SELECT id INTO tier_up_id FROM crm_flows WHERE name = 'Tier-Up Celebration' LIMIT 1;
END IF;

DELETE FROM crm_flow_steps WHERE flow_id = tier_up_id;
INSERT INTO crm_flow_steps (flow_id, step_number, action_type, config, wait_duration_seconds) VALUES
  (tier_up_id, 1, 'wait',       '{}', 600),
  (tier_up_id, 2, 'send_email', '{"templateSlug":"tier_up_celebration"}', NULL),
  (tier_up_id, 3, 'end',        '{}', NULL);

END $$;
