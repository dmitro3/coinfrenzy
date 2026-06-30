-- docs/13 — Gamma migration pipeline.
--
-- The existing migration tables (added in 0000_init / 0002_seed) cover the
-- declarative side: column mappings, ID maps, and per-table import summaries.
-- This migration adds the imperative side: per-run tracking, per-row errors,
-- the manual-review queue for ambiguous mappings, the singleton
-- "migration_balance" bonus that carries outstanding playthrough, and the
-- dual-capture mode flag in system_config that prevents pre-cutover webhook
-- processing in the T-30 window.
--
-- Everything here is master-only at the application layer. RLS keeps
-- non-admins out at the database layer.

-- ============================================================================
-- migration_runs — one row per import attempt
-- ============================================================================
--
-- A "run" is a single end-to-end attempt to import a snapshot. Each run
-- has many `migration_imports` (one per table) and many
-- `migration_row_errors`. Runs are append-only conceptually; status moves
-- forward: queued -> running -> validated|failed|cancelled.

CREATE TABLE IF NOT EXISTS "migration_runs" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_date"       date NOT NULL,
  "snapshot_uri"        text NOT NULL,
  "mode"                text NOT NULL DEFAULT 'dry_run',
  "status"              text NOT NULL DEFAULT 'queued',

  -- High-level counters rolled up across all per-table imports.
  "tables_total"        integer NOT NULL DEFAULT 0,
  "tables_succeeded"    integer NOT NULL DEFAULT 0,
  "tables_failed"       integer NOT NULL DEFAULT 0,
  "rows_imported"       integer NOT NULL DEFAULT 0,
  "rows_skipped"        integer NOT NULL DEFAULT 0,
  "rows_failed"         integer NOT NULL DEFAULT 0,

  -- Validation summary (filled by validation step).
  "validation_status"   text,
  "validation_summary"  jsonb,

  "triggered_by"        uuid,
  "triggered_at"        timestamptz NOT NULL DEFAULT now(),
  "started_at"          timestamptz,
  "completed_at"        timestamptz,

  "notes"               text,
  "error_summary"       text,

  CONSTRAINT "migration_runs_mode_check"
    CHECK (mode IN ('dry_run', 'production')),
  CONSTRAINT "migration_runs_status_check"
    CHECK (status IN ('queued', 'running', 'imported', 'validated', 'failed', 'cancelled')),
  CONSTRAINT "migration_runs_validation_status_check"
    CHECK (validation_status IS NULL OR validation_status IN ('pending', 'passed', 'soft_warnings', 'failed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "migration_runs_status_idx"
  ON "migration_runs" (status, triggered_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_runs_snapshot_date_idx"
  ON "migration_runs" (snapshot_date DESC);
--> statement-breakpoint

ALTER TABLE "migration_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "migration_runs_admin_read" ON "migration_runs" FOR SELECT
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint
CREATE POLICY "migration_runs_admin_write" ON "migration_runs" FOR ALL
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'))
  WITH CHECK (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

-- Attach the run id to migration_imports so each per-table import is
-- traceable to its parent run.
ALTER TABLE "migration_imports"
  ADD COLUMN IF NOT EXISTS "run_id" uuid REFERENCES "migration_runs"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_imports_run_idx"
  ON "migration_imports" (run_id);
--> statement-breakpoint

-- ============================================================================
-- migration_row_errors — per-row failures during import
-- ============================================================================
--
-- One row per source-row that failed to import. Used for the admin
-- review UI ("21 rows failed, here they are") and for soft-validation
-- gates (e.g. "are there unparseable dates?").

CREATE TABLE IF NOT EXISTS "migration_row_errors" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id"              uuid NOT NULL REFERENCES "migration_runs"("id") ON DELETE CASCADE,

  "source_file"         text NOT NULL,
  "source_row_number"   integer,
  "source_row_id"       text,
  "source_row_snapshot" jsonb,

  "error_code"          text NOT NULL,
  "error_message"       text NOT NULL,
  "error_field"         text,

  "created_at"          timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "migration_row_errors_run_idx"
  ON "migration_row_errors" (run_id, source_file);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_row_errors_code_idx"
  ON "migration_row_errors" (error_code);
--> statement-breakpoint

ALTER TABLE "migration_row_errors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "migration_row_errors_admin_read" ON "migration_row_errors" FOR SELECT
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint
CREATE POLICY "migration_row_errors_admin_write" ON "migration_row_errors" FOR ALL
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'))
  WITH CHECK (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

-- ============================================================================
-- migration_review_queue — manual-review for ambiguous mappings
-- ============================================================================
--
-- docs/13 §4.3 — the "unknown rsg pattern" cases (and any other ambiguous
-- mappings discovered at import time) write to this queue for human
-- resolution. A KYC reviewer or master admin opens each, picks an
-- interpretation, and the system applies it. The queue must be empty
-- before final cutover (one of the soft-validation gates).

CREATE TABLE IF NOT EXISTS "migration_review_queue" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id"              uuid REFERENCES "migration_runs"("id") ON DELETE CASCADE,

  "kind"                text NOT NULL,
  "source_file"         text NOT NULL,
  "source_row_id"       text,
  "source_row_snapshot" jsonb,
  "source_text"         text,

  "player_id"           uuid REFERENCES "players"("id") ON DELETE CASCADE,

  "suggestion"          jsonb,
  "status"              text NOT NULL DEFAULT 'open',

  "resolved_by"         uuid,
  "resolved_at"         timestamptz,
  "resolution"          jsonb,
  "resolution_notes"    text,

  "created_at"          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "migration_review_queue_status_check"
    CHECK (status IN ('open', 'applied', 'dismissed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "migration_review_queue_open_idx"
  ON "migration_review_queue" (created_at DESC)
  WHERE status = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_review_queue_kind_idx"
  ON "migration_review_queue" (kind, status);
--> statement-breakpoint

ALTER TABLE "migration_review_queue" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "migration_review_queue_admin_read" ON "migration_review_queue" FOR SELECT
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint
CREATE POLICY "migration_review_queue_admin_write" ON "migration_review_queue" FOR ALL
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'))
  WITH CHECK (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

-- ============================================================================
-- migration_replay_log — every webhook we replayed and what came of it
-- ============================================================================
--
-- During the 30-day capture window we mark webhooks status='received' and
-- DO NOT dispatch them to Inngest. On cutover, the replay tool pulls those
-- rows, dispatches them through the standard processor, and records the
-- outcome here so the cutover team has a forensic log of "we replayed
-- 412 webhooks, 411 completed, 1 failed". Soft-validation gate fails the
-- run if any replay failure remains unresolved.

CREATE TABLE IF NOT EXISTS "migration_replay_log" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id"              uuid REFERENCES "migration_runs"("id") ON DELETE SET NULL,
  "pending_webhook_id"  uuid NOT NULL REFERENCES "pending_webhooks"("id") ON DELETE CASCADE,

  "provider"            text NOT NULL,
  "event_type"          text NOT NULL,
  "received_at"         timestamptz NOT NULL,
  "replayed_at"         timestamptz NOT NULL DEFAULT now(),
  "outcome"             text NOT NULL,
  "error"               text,

  CONSTRAINT "migration_replay_log_outcome_check"
    CHECK (outcome IN ('completed', 'failed', 'duplicate', 'skipped'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "migration_replay_log_run_idx"
  ON "migration_replay_log" (run_id, replayed_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_replay_log_outcome_idx"
  ON "migration_replay_log" (outcome, replayed_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "migration_replay_log_webhook_unique"
  ON "migration_replay_log" (pending_webhook_id);
--> statement-breakpoint

ALTER TABLE "migration_replay_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "migration_replay_log_admin_read" ON "migration_replay_log" FOR SELECT
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint
CREATE POLICY "migration_replay_log_admin_write" ON "migration_replay_log" FOR ALL
  USING (current_setting('app.actor_kind', true) IN ('admin', 'system'))
  WITH CHECK (current_setting('app.actor_kind', true) IN ('admin', 'system'));
--> statement-breakpoint

-- ============================================================================
-- Singleton "migration_balance" bonus — docs/13 §4.5
-- ============================================================================
--
-- One synthetic bonus row that every per-player synthetic award refers to.
-- The award (in bonuses_awarded) carries the per-player amount; this row
-- carries the template metadata so it can be queried and reported on.
--
-- Defensive: the bonus is created with a fixed UUID so the import code
-- can reference it by ID without an extra SELECT. The UUID is committed
-- into the codebase (packages/core/src/migration/constants.ts).

INSERT INTO "bonuses" (
  "id",
  "slug",
  "display_name",
  "bonus_type",
  "award_gc",
  "award_sc",
  "playthrough_multiplier",
  "status",
  "description",
  "terms"
) VALUES (
  '13130000-0000-4000-8000-000000000001',
  'migration_balance',
  'Migrated Balance (Outstanding Playthrough)',
  'admin_added_sc',
  0,
  0,
  1.0,
  'inactive',
  'Synthetic bonus created during Gamma migration to preserve outstanding playthrough requirements. Each award represents a specific player''s state at migration time. Per docs/13 §4.5.',
  'This bonus cannot be awarded directly. Only the migration importer creates awards against it.'
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- ============================================================================
-- Dual-capture mode flag in system_config
-- ============================================================================
--
-- Per docs/13 §6.1, during the T-30 to T-0 window we want webhooks to be
-- persisted in pending_webhooks but NOT processed. Setting
-- system_config.value.enabled=true causes the webhook receiver to skip
-- the Inngest dispatch and leave the row in status='received'. On
-- cutover, the replay tool picks them up.
--
-- Stored under key 'webhook_dual_capture' so it's discoverable next to
-- the other operator-tunable knobs.

INSERT INTO "system_config" ("key", "value", "description") VALUES (
  'webhook_dual_capture',
  '{
    "enabled": false,
    "since": null,
    "providers": ["finix", "alea", "footprint"],
    "notes": "When enabled, the webhook receiver stores incoming events but does NOT dispatch them to Inngest. Used in the T-30 to T-0 migration capture window. Replay via /admin/migration."
  }'::jsonb,
  'Per docs/13 §6.1 — webhook dual-capture mode for Gamma cutover. Master-only.'
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
