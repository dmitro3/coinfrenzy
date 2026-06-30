-- docs/04 §7.2 — alea_reconciliation_findings.
--
-- The nightly Alea round reconciliation cron compares Alea's authoritative
-- round-history pull to our local game_rounds and writes one row per
-- discrepancy. The admin Integrity page lists open findings; PagerDuty
-- pages on rows with severity='critical'. Rows are append-only conceptually
-- but admins can move status open -> resolved|ignored|replayed via the UI.

CREATE TABLE IF NOT EXISTS "alea_reconciliation_findings" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_started_at"      timestamptz NOT NULL,
  "window_start_at"     timestamptz NOT NULL,
  "window_end_at"       timestamptz NOT NULL,
  "external_round_id"   text NOT NULL,
  "kind"                text NOT NULL,
  "severity"            text NOT NULL DEFAULT 'warn',
  "alea_bet"            numeric(20,4),
  "alea_win"            numeric(20,4),
  "ours_bet"            numeric(20,4),
  "ours_win"            numeric(20,4),
  "currency"            text,
  "player_id"           uuid,
  "game_id"             uuid,
  "status"              text NOT NULL DEFAULT 'open',
  "resolved_by"         uuid,
  "resolved_at"         timestamptz,
  "resolution_notes"    text,
  "detail"              jsonb,
  "created_at"          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "alea_reconciliation_findings_kind_check"
    CHECK (kind IN ('missing_from_ours', 'missing_from_alea', 'amount_mismatch', 'currency_mismatch', 'status_mismatch')),
  CONSTRAINT "alea_reconciliation_findings_severity_check"
    CHECK (severity IN ('info', 'warn', 'critical')),
  CONSTRAINT "alea_reconciliation_findings_status_check"
    CHECK (status IN ('open', 'resolved', 'ignored', 'replayed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alea_reconciliation_findings_open_idx"
  ON "alea_reconciliation_findings" (created_at)
  WHERE status = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alea_reconciliation_findings_round_idx"
  ON "alea_reconciliation_findings" (external_round_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alea_reconciliation_findings_run_idx"
  ON "alea_reconciliation_findings" (run_started_at);
--> statement-breakpoint

ALTER TABLE "alea_reconciliation_findings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "alea_reconciliation_findings_admin_read"
  ON "alea_reconciliation_findings" FOR SELECT
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

CREATE POLICY "alea_reconciliation_findings_admin_write"
  ON "alea_reconciliation_findings" FOR ALL
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'))
  WITH CHECK (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint
