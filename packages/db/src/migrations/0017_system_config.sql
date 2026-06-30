-- docs/09 — operator-tunable system safety caps.
--
-- Previously the tier safety caps (max weekly SC, max monthly SC, max
-- login multiplier, max cashback %) lived as the `TIER_CAPS` constant
-- in packages/core/src/tiers/admin.ts. That meant adjusting them
-- required a code deploy AND there was no audit trail of who changed
-- what or when.
--
-- This table moves caps (and any future cross-cutting safety limits)
-- into a master-only config surface that:
--   * persists current values with last-writer attribution
--   * is editable only by master role through /admin/settings/safety-caps
--   * is double-clamped against hard ceilings hardcoded in core, so
--     even a misconfigured row cannot expand the platform's exposure
--     past the engineering-set ceiling
--
-- Each row stores ONE config blob keyed by a stable string. We keep
-- the data as JSONB for forward-flexibility (the tier caps blob can
-- grow new fields without a migration) but the in-core read helper
-- in packages/core/src/system/config.ts validates a strict schema
-- against `key` before returning.

CREATE TABLE IF NOT EXISTS "system_config" (
  "key"             text PRIMARY KEY,
  "value"           jsonb NOT NULL,
  "description"     text,
  "updated_by"      uuid,
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  "created_at"      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "system_config" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Reads: any admin actor or the system. Hosts and players never need
-- to know the tier caps directly; tier evaluation runs server-side.
CREATE POLICY "system_config_admin_read" ON "system_config" FOR SELECT
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

-- Writes: admin actor only at the RLS layer. The application layer
-- additionally restricts to role=master via canEditSafetyCaps() so
-- only the founder/master role can mutate. Every mutation MUST go
-- through the core write helper which appends an audit_log entry.
CREATE POLICY "system_config_admin_write" ON "system_config" FOR ALL
  USING (current_setting('app.actor_kind', true) = 'admin')
  WITH CHECK (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- Seed the current tier caps (matches the previous in-code TIER_CAPS
-- constant). Idempotent via key PK + ON CONFLICT DO NOTHING.
--
-- Hardcoded outer ceilings (enforced in core, never overridable from
-- this row):
--   weekly_sc_max     <= 25,000.00 (250M minor)
--   monthly_sc_max    <= 100,000.00 (1B minor)
--   login_mult_max    <= 5.00
--   cashback_pct_max  <= 50.00
INSERT INTO "system_config" ("key", "value", "description") VALUES (
  'tier_caps',
  '{
    "weekly_sc_max": 5000.00,
    "monthly_sc_max": 25000.00,
    "login_mult_max": 3.00,
    "cashback_pct_max": 25.00
  }'::jsonb,
  'Per-tier reward ceilings. weekly_sc_max and monthly_sc_max are in MAJOR SC. login_mult_max is the maximum login-streak multiplier. cashback_pct_max is the maximum daily loss cashback percent.'
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
