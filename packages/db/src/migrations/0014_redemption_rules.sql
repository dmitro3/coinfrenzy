-- docs/07 §5.1 — operator-tunable redemption auto-approval rules.
--
-- Replaces the hard-coded AUTO_APPROVE_THRESHOLD_USD constant with a
-- proper rules table so cashier ops can tweak the auto-approve ceiling
-- and KYC requirements without a code deploy. The default rule we seed
-- here matches the existing gamma operator behaviour: auto-approve up
-- to $500 for KYC level 4-5 players who have at least one paid
-- redemption on file. Everything else falls through to the cashier
-- queue.
--
-- Rule precedence: lower priority number runs first. The first matching
-- rule wins. Falling off the bottom of the list = pending_review.

CREATE TABLE IF NOT EXISTS "redemption_rules" (
  "id"                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title"                           text NOT NULL,
  "description"                     text,
  "priority"                        integer NOT NULL DEFAULT 100,
  "is_active"                       boolean NOT NULL DEFAULT true,
  "action"                          text NOT NULL DEFAULT 'auto_approve',
  "max_amount_usd"                  numeric(20, 4),
  "min_amount_usd"                  numeric(20, 4),
  "required_kyc_levels"             jsonb NOT NULL DEFAULT '[]'::jsonb,
  "blocked_states"                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "require_prior_paid_redemption"   boolean NOT NULL DEFAULT false,
  "completion_hours"                integer NOT NULL DEFAULT 0,
  "created_by"                      uuid,
  "updated_by"                      uuid,
  "created_at"                      timestamptz NOT NULL DEFAULT now(),
  "updated_at"                      timestamptz NOT NULL DEFAULT now(),
  "archived_at"                     timestamptz,
  CONSTRAINT "redemption_rules_action_check"
    CHECK ("action" IN ('auto_approve', 'route_to_review'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "redemption_rules_priority_idx"
  ON "redemption_rules" ("priority")
  WHERE "is_active" = true AND "archived_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "redemption_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Reads are open: rule data is operator-facing policy (no PII), and the
-- redemption-create flow needs to evaluate rules while running as a
-- 'player' actor. Filtering to active + non-archived keeps the row count
-- bounded and prevents player code from spying on archived/disabled
-- rules a manager hasn't shipped yet.
CREATE POLICY "redemption_rules_authenticated_read" ON "redemption_rules" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) IN ('admin', 'player', 'system')
    AND ("is_active" = true OR current_setting('app.actor_kind', true) = 'admin')
    AND ("archived_at" IS NULL OR current_setting('app.actor_kind', true) = 'admin')
  );
--> statement-breakpoint

-- Writes are admin-only. The application layer further gates to
-- manager+ via the role check on /api/admin/cashier/redeem-rules.
CREATE POLICY "redemption_rules_admin_write" ON "redemption_rules" FOR ALL
  USING (current_setting('app.actor_kind', true) = 'admin')
  WITH CHECK (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- Seed the operator's existing rule. We use a deterministic UUID so
-- re-running the migration is idempotent and the seed row is easy to
-- spot in the admin list.
INSERT INTO "redemption_rules" (
  "id",
  "title",
  "description",
  "priority",
  "is_active",
  "action",
  "max_amount_usd",
  "required_kyc_levels",
  "require_prior_paid_redemption",
  "completion_hours"
) VALUES (
  '00000000-0000-0000-0000-0000000ed500',
  '$500 or less instant',
  'Auto-approve any redemption $500 or less from KYC-verified players with at least one prior paid redemption. Everything else goes to the cashier review queue.',
  100,
  true,
  'auto_approve',
  500.0000,
  '[4, 5]'::jsonb,
  true,
  0
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
