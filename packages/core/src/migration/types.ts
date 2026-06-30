// docs/13 — shared types for the Gamma migration pipeline.
//
// The pipeline has two halves:
//   1. Import — parse a snapshot, transform rows, idempotently load.
//   2. Validate — confirm the imported state matches Gamma totals.
//
// Both halves operate on the same RunContext so the orchestrator can
// thread per-run id, snapshot date, mode (dry_run|production), and a
// shared error sink through every step.

import type { Context } from '../context'

export type MigrationRunMode = 'dry_run' | 'production'

export type MigrationRunStatus =
  | 'queued'
  | 'running'
  | 'imported'
  | 'validated'
  | 'failed'
  | 'cancelled'

export type MigrationValidationStatus = 'pending' | 'passed' | 'soft_warnings' | 'failed'

/** A logical filename inside an R2 snapshot prefix. */
export type SnapshotFileKey =
  | 'players'
  | 'purchases'
  | 'redemptions'
  | 'transactions'
  | 'daily_kpis'
  | 'affiliates'

/**
 * Maps the logical key above to a Gamma-CSV filename. Real Gamma exports
 * use these exact names today; if Gamma renames an export, only this
 * mapping changes.
 */
export const SNAPSHOT_FILE_NAMES: Record<SnapshotFileKey, string> = {
  players: 'players_data.csv',
  purchases: 'purchase_report.csv',
  redemptions: 'redeem_requests_data.csv',
  transactions: 'transactions_banking_data.csv',
  daily_kpis: 'merv_report.csv',
  affiliates: 'affiliate_report.csv',
}

/**
 * A parsed CSV — column headers and rows as string-keyed objects. The
 * parser preserves all values as strings; transforms are responsible for
 * casting numeric / boolean / date fields.
 */
export interface ParsedCsv {
  filename: string
  headers: string[]
  rows: Record<string, string>[]
}

/** A flat row-error captured for forensic UI display. */
export interface RowErrorSpec {
  sourceFile: string
  sourceRowNumber?: number | null
  sourceRowId?: string | null
  sourceRowSnapshot?: Record<string, unknown> | null
  errorCode: string
  errorMessage: string
  errorField?: string | null
}

/** A review-queue entry written when an ambiguous mapping is encountered. */
export interface ReviewQueueSpec {
  kind: 'unknown_rsg' | 'unknown_status' | 'ambiguous_balance' | 'duplicate_external_id' | 'other'
  sourceFile: string
  sourceRowId?: string | null
  sourceRowSnapshot?: Record<string, unknown> | null
  sourceText?: string | null
  playerId?: string | null
  suggestion?: Record<string, unknown> | null
}

/**
 * Per-table import summary — written into migration_imports at the end of
 * each step.
 */
export interface ImportStepSummary {
  sourceFile: string
  tableName: string
  rowsInSource: number
  rowsImported: number
  rowsSkipped: number
  rowsFailed: number
  status: 'success' | 'partial' | 'failed'
  errorSummary?: string | null
}

/**
 * The runtime context threaded through every import step. The orchestrator
 * creates one when a run starts; each step receives it and mutates the
 * `summaries` / `errors` arrays. After the run, the orchestrator persists
 * the rolled-up totals to `migration_runs`.
 */
export interface RunContext {
  ctx: Context
  runId: string
  snapshotDate: string
  snapshotUri: string
  mode: MigrationRunMode
  summaries: ImportStepSummary[]
  errors: RowErrorSpec[]
  reviews: ReviewQueueSpec[]
  /**
   * Set to true when a fatal error is encountered; subsequent steps
   * MUST early-return. Steps may also halt themselves on per-step
   * ceiling violations.
   */
  aborted: boolean
}

/** Validation gates per docs/13 §5. */
export interface ValidationGateResult {
  check: string
  severity: 'hard' | 'soft'
  passed: boolean
  expected?: number | string | null
  actual?: number | string | null
  detail?: string
  samples?: unknown[]
}

export interface ValidationReport {
  status: MigrationValidationStatus
  gates: ValidationGateResult[]
  hardFailures: number
  softWarnings: number
  ranAt: string
}

/** Outcome of running one webhook replay step during cutover. */
export interface ReplayWebhookResult {
  total: number
  completed: number
  failed: number
  duplicate: number
  skipped: number
}
