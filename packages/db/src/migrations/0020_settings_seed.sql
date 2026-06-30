-- docs/09 — operator-tunable runtime settings.
--
-- Extends the system_config table (created in 0017) with four additional
-- well-known keys that back the /admin/settings page. Every key is
-- read+written through a typed helper in packages/core/src/system/settings.ts
-- with hard ceilings + audit logging.
--
-- The seed values match the previously-hardcoded display values from the
-- /admin/settings page so the page reads the same after migration; they
-- become editable from the page itself afterwards.
--
-- Permission matrix (enforced at the route layer; RLS keeps non-admins out):
--   general              -> manager+ (no money impact)
--   bonus_defaults       -> manager+ (capped elsewhere by tier_caps)
--   rg_defaults          -> master only (legal exposure)
--   redemption_caps      -> master only (money safety)

INSERT INTO "system_config" ("key", "value", "description") VALUES (
  'general',
  '{
    "platform_name": "CoinFrenzy",
    "support_email": "support@coinfrenzy.casino",
    "support_hours": "24/7",
    "social_twitter": null,
    "social_instagram": null,
    "social_facebook": null
  }'::jsonb,
  'Public-facing platform identity. Strings only. Editable by manager+.'
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "system_config" ("key", "value", "description") VALUES (
  'rg_defaults',
  '{
    "daily_purchase_limit_usd": 1000.00,
    "weekly_purchase_limit_usd": 5000.00,
    "monthly_purchase_limit_usd": 15000.00,
    "session_length_minutes": 180,
    "cooling_off_hours": 24
  }'::jsonb,
  'Responsible-gaming defaults applied to new accounts. USD amounts are MAJOR units. Players can tighten via self-service. Master-only.'
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "system_config" ("key", "value", "description") VALUES (
  'bonus_defaults',
  '{
    "default_playthrough_multiplier": 1.0,
    "default_playthrough_window_hours": 168,
    "default_expiry_days": 30,
    "stacking_enabled": false
  }'::jsonb,
  'Defaults applied when a bonus template omits an explicit value. Manager+ editable.'
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "system_config" ("key", "value", "description") VALUES (
  'redemption_caps',
  '{
    "min_redemption_usd": 50.00,
    "max_redemption_usd": 5000.00,
    "daily_redemption_cap_usd": 2500.00,
    "auto_approval_threshold_usd": 50.00
  }'::jsonb,
  'Operator-wide redemption ceilings (USD MAJOR). Per-rule auto-approval lives in redemption_rules. Master-only.'
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
