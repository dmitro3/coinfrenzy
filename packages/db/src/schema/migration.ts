import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt, money, tstz } from './_shared'
import { players } from './players'
import { pendingWebhooks } from './webhooks'

// docs/03 §15 — migration_imports (extended in 0021 with run_id).

export const migrationImports = pgTable('migration_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotDate: date('snapshot_date').notNull(),
  source: text('source').notNull(),

  tableName: text('table_name').notNull(),
  rowsInSource: integer('rows_in_source').notNull(),
  rowsImported: integer('rows_imported').notNull(),
  rowsSkipped: integer('rows_skipped').notNull(),
  rowsFailed: integer('rows_failed').notNull(),

  status: text('status').notNull(),
  errorSummary: text('error_summary'),

  mappingConfig: jsonb('mapping_config'),

  runId: uuid('run_id'),

  startedAt: tstz('started_at').notNull().defaultNow(),
  completedAt: tstz('completed_at'),
})

// docs/03 §15 — migration_id_map.

export const migrationIdMap = pgTable(
  'migration_id_map',
  {
    sourceTable: text('source_table').notNull(),
    gammaId: text('gamma_id').notNull(),
    casinoId: uuid('casino_id').notNull(),
    importedAt: tstz('imported_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceTable, t.gammaId] }),
    index('migration_id_map_casino_idx').on(t.casinoId),
  ],
)

// docs/03 §15 — migration_column_mappings.

export const migrationColumnMappings = pgTable(
  'migration_column_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceFile: text('source_file').notNull(),
    sourceColumn: text('source_column').notNull(),
    targetTable: text('target_table').notNull(),
    // Nullable to support free-text source columns (e.g. Gamma's `rsg`)
    // that parse into multiple target rows rather than a single column.
    targetColumn: text('target_column'),

    transform: text('transform'),
    transformExpression: text('transform_expression'),

    notes: text('notes'),
  },
  (t) => [
    unique('migration_column_mappings_unique').on(
      t.sourceFile,
      t.sourceColumn,
      t.targetTable,
      t.targetColumn,
    ),
  ],
)

// docs/13 §3-§5 — migration_runs. One row per import attempt.

export const migrationRuns = pgTable(
  'migration_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotDate: date('snapshot_date').notNull(),
    snapshotUri: text('snapshot_uri').notNull(),
    mode: text('mode').notNull().default('dry_run'),
    status: text('status').notNull().default('queued'),

    tablesTotal: integer('tables_total').notNull().default(0),
    tablesSucceeded: integer('tables_succeeded').notNull().default(0),
    tablesFailed: integer('tables_failed').notNull().default(0),
    rowsImported: integer('rows_imported').notNull().default(0),
    rowsSkipped: integer('rows_skipped').notNull().default(0),
    rowsFailed: integer('rows_failed').notNull().default(0),

    validationStatus: text('validation_status'),
    validationSummary: jsonb('validation_summary'),

    triggeredBy: uuid('triggered_by'),
    triggeredAt: tstz('triggered_at').notNull().defaultNow(),
    startedAt: tstz('started_at'),
    completedAt: tstz('completed_at'),

    notes: text('notes'),
    errorSummary: text('error_summary'),
  },
  (t) => [
    index('migration_runs_status_idx').on(t.status, sql`${t.triggeredAt} desc`),
    index('migration_runs_snapshot_date_idx').on(sql`${t.snapshotDate} desc`),
    check('migration_runs_mode_check', sql`${t.mode} in ('dry_run', 'production')`),
    check(
      'migration_runs_status_check',
      sql`${t.status} in ('queued', 'running', 'imported', 'validated', 'failed', 'cancelled')`,
    ),
    check(
      'migration_runs_validation_status_check',
      sql`${t.validationStatus} is null or ${t.validationStatus} in ('pending', 'passed', 'soft_warnings', 'failed')`,
    ),
  ],
)

// docs/13 — migration_row_errors. Per-row failures during import.

export const migrationRowErrors = pgTable(
  'migration_row_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => migrationRuns.id, { onDelete: 'cascade' }),

    sourceFile: text('source_file').notNull(),
    sourceRowNumber: integer('source_row_number'),
    sourceRowId: text('source_row_id'),
    sourceRowSnapshot: jsonb('source_row_snapshot'),

    errorCode: text('error_code').notNull(),
    errorMessage: text('error_message').notNull(),
    errorField: text('error_field'),

    createdAt: createdAt(),
  },
  (t) => [
    index('migration_row_errors_run_idx').on(t.runId, t.sourceFile),
    index('migration_row_errors_code_idx').on(t.errorCode),
  ],
)

// docs/13 §4.3 — migration_review_queue. Manual-review queue for
// ambiguous mappings (unknown rsg patterns, etc.). Master must drain
// this before final cutover.

export const migrationReviewQueue = pgTable(
  'migration_review_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').references(() => migrationRuns.id, { onDelete: 'cascade' }),

    kind: text('kind').notNull(),
    sourceFile: text('source_file').notNull(),
    sourceRowId: text('source_row_id'),
    sourceRowSnapshot: jsonb('source_row_snapshot'),
    sourceText: text('source_text'),

    playerId: uuid('player_id').references(() => players.id, { onDelete: 'cascade' }),

    suggestion: jsonb('suggestion'),
    status: text('status').notNull().default('open'),

    resolvedBy: uuid('resolved_by'),
    resolvedAt: tstz('resolved_at'),
    resolution: jsonb('resolution'),
    resolutionNotes: text('resolution_notes'),

    createdAt: createdAt(),
  },
  (t) => [
    index('migration_review_queue_open_idx')
      .on(sql`${t.createdAt} desc`)
      .where(sql`${t.status} = 'open'`),
    index('migration_review_queue_kind_idx').on(t.kind, t.status),
    check(
      'migration_review_queue_status_check',
      sql`${t.status} in ('open', 'applied', 'dismissed')`,
    ),
  ],
)

// docs/13 §6 — migration_replay_log. Records each pending_webhooks
// row replayed during cutover and the outcome.

export const migrationReplayLog = pgTable(
  'migration_replay_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').references(() => migrationRuns.id, { onDelete: 'set null' }),
    pendingWebhookId: uuid('pending_webhook_id')
      .notNull()
      .references(() => pendingWebhooks.id, { onDelete: 'cascade' }),

    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    receivedAt: tstz('received_at').notNull(),
    replayedAt: tstz('replayed_at').notNull().defaultNow(),
    outcome: text('outcome').notNull(),
    error: text('error'),
  },
  (t) => [
    index('migration_replay_log_run_idx').on(t.runId, sql`${t.replayedAt} desc`),
    index('migration_replay_log_outcome_idx').on(t.outcome, sql`${t.replayedAt} desc`),
    uniqueIndex('migration_replay_log_webhook_unique').on(t.pendingWebhookId),
    check(
      'migration_replay_log_outcome_check',
      sql`${t.outcome} in ('completed', 'failed', 'duplicate', 'skipped')`,
    ),
  ],
)

// docs/03 §15 — tax_reports.

export const taxReports = pgTable(
  'tax_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),

    taxYear: integer('tax_year').notNull(),
    formType: text('form_type').notNull(),

    totalAmountUsd: money('total_amount_usd').notNull(),
    redemptionCount: integer('redemption_count').notNull(),

    status: text('status').notNull().default('pending_generation'),

    generatedAt: tstz('generated_at'),
    deliveredAt: tstz('delivered_at'),
    filedAt: tstz('filed_at'),

    deliveryMethod: text('delivery_method'),

    createdAt: createdAt(),
  },
  (t) => [
    unique('tax_reports_player_year_form_unique').on(t.playerId, t.taxYear, t.formType),
    index('tax_reports_year_idx').on(t.taxYear, t.status),
    check(
      'tax_reports_status_check',
      sql`${t.status} in ('pending_generation', 'generated', 'delivered', 'filed', 'cancelled')`,
    ),
  ],
)
