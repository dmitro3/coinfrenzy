// docs/13 §3.4 — orchestrator for one migration run.
//
// Steps are deliberately small + idempotent so partial failure leaves us
// in a recoverable state. Each step has the shape:
//   async function step(rc: RunContext, file: ParsedCsv): Promise<void>
// and reports its outcome to `rc.summaries`. The orchestrator persists
// the rolled-up totals into migration_runs at the very end.

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'

import { parseCsv } from './csv'
import { getSnapshotStore } from './snapshot-store'
import {
  SNAPSHOT_FILE_NAMES,
  type MigrationRunMode,
  type RunContext,
  type SnapshotFileKey,
} from './types'
import { importPlayers } from './import-players'
import { importAffiliates } from './import-affiliates'
import { importPurchases } from './import-purchases'
import { importRedemptions } from './import-redemptions'
import { importDailyKpis } from './import-daily-kpis'

export interface StartRunInput {
  ctx: Context
  snapshotDate: string
  mode: MigrationRunMode
  triggeredBy?: string | null
  notes?: string | null
}

export interface RunOutcome {
  runId: string
  status: 'imported' | 'failed'
  rowsImported: number
  rowsSkipped: number
  rowsFailed: number
  tablesSucceeded: number
  tablesFailed: number
  errorSummary: string | null
}

/**
 * Starts a run, executes every step, persists summaries, and writes an
 * audit entry. The run is bracketed in a single conceptual unit but each
 * step opens its own narrow transactions so a slow step doesn't hold an
 * outer lock for the entire pipeline.
 */
export async function startRun(input: StartRunInput): Promise<RunOutcome> {
  const { ctx, snapshotDate, mode } = input
  const snapshotUri = `${SNAPSHOT_URI_PREFIX}/${snapshotDate}`

  const [created] = await ctx.db
    .insert(schema.migrationRuns)
    .values({
      snapshotDate,
      snapshotUri,
      mode,
      status: 'running',
      triggeredBy: input.triggeredBy ?? null,
      startedAt: new Date(),
      notes: input.notes ?? null,
    })
    .returning({ id: schema.migrationRuns.id })

  const runId = created.id
  const rc: RunContext = {
    ctx,
    runId,
    snapshotDate,
    snapshotUri,
    mode,
    summaries: [],
    errors: [],
    reviews: [],
    aborted: false,
  }

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: input.triggeredBy ?? null,
    action: 'migration.run.started',
    resourceKind: 'migration_run',
    resourceId: runId,
    metadata: { snapshotDate, mode },
  })

  const store = getSnapshotStore()
  const errorSummaryParts: string[] = []

  for (const step of ORDERED_STEPS) {
    if (rc.aborted) break
    const filename = SNAPSHOT_FILE_NAMES[step.key]
    try {
      const content = await store.readFile(snapshotDate, filename)
      if (content == null) {
        rc.summaries.push({
          sourceFile: filename,
          tableName: step.tableName,
          rowsInSource: 0,
          rowsImported: 0,
          rowsSkipped: 0,
          rowsFailed: 0,
          status: 'success',
          errorSummary: 'snapshot file absent',
        })
        continue
      }
      const parsed = parseCsv(filename, content)
      await step.runner(rc, parsed)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errorSummaryParts.push(`${filename}: ${message}`)
      rc.summaries.push({
        sourceFile: filename,
        tableName: step.tableName,
        rowsInSource: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        rowsFailed: 0,
        status: 'failed',
        errorSummary: message,
      })
      // Halt on the player step (everything else depends on players).
      if (step.haltOnError) rc.aborted = true
    }
  }

  // Persist per-table summaries
  for (const s of rc.summaries) {
    await ctx.db.insert(schema.migrationImports).values({
      snapshotDate,
      source: 'gamma',
      tableName: s.tableName,
      rowsInSource: s.rowsInSource,
      rowsImported: s.rowsImported,
      rowsSkipped: s.rowsSkipped,
      rowsFailed: s.rowsFailed,
      status: s.status,
      errorSummary: s.errorSummary ?? null,
      runId,
      completedAt: new Date(),
    })
  }

  // Persist per-row errors
  if (rc.errors.length > 0) {
    // Chunk inserts so we don't exceed parameter limits on huge runs
    const CHUNK = 200
    for (let i = 0; i < rc.errors.length; i += CHUNK) {
      const slice = rc.errors.slice(i, i + CHUNK)
      await ctx.db.insert(schema.migrationRowErrors).values(
        slice.map((e) => ({
          runId,
          sourceFile: e.sourceFile,
          sourceRowNumber: e.sourceRowNumber ?? null,
          sourceRowId: e.sourceRowId ?? null,
          sourceRowSnapshot: e.sourceRowSnapshot ?? null,
          errorCode: e.errorCode,
          errorMessage: e.errorMessage,
          errorField: e.errorField ?? null,
        })),
      )
    }
  }

  if (rc.reviews.length > 0) {
    for (const r of rc.reviews) {
      await ctx.db.insert(schema.migrationReviewQueue).values({
        runId,
        kind: r.kind,
        sourceFile: r.sourceFile,
        sourceRowId: r.sourceRowId ?? null,
        sourceRowSnapshot: r.sourceRowSnapshot ?? null,
        sourceText: r.sourceText ?? null,
        playerId: r.playerId ?? null,
        suggestion: r.suggestion ?? null,
        status: 'open',
      })
    }
  }

  const rowsImported = rc.summaries.reduce((a, s) => a + s.rowsImported, 0)
  const rowsSkipped = rc.summaries.reduce((a, s) => a + s.rowsSkipped, 0)
  const rowsFailed = rc.summaries.reduce((a, s) => a + s.rowsFailed, 0)
  const tablesSucceeded = rc.summaries.filter((s) => s.status !== 'failed').length
  const tablesFailed = rc.summaries.filter((s) => s.status === 'failed').length
  const status: 'imported' | 'failed' = tablesFailed > 0 || rc.aborted ? 'failed' : 'imported'
  const errorSummary = errorSummaryParts.length > 0 ? errorSummaryParts.join('\n') : null

  await ctx.db
    .update(schema.migrationRuns)
    .set({
      status,
      tablesTotal: rc.summaries.length,
      tablesSucceeded,
      tablesFailed,
      rowsImported,
      rowsSkipped,
      rowsFailed,
      completedAt: new Date(),
      errorSummary,
    })
    .where(eq(schema.migrationRuns.id, runId))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: input.triggeredBy ?? null,
    action: 'migration.run.completed',
    resourceKind: 'migration_run',
    resourceId: runId,
    metadata: {
      status,
      rowsImported,
      rowsFailed,
      tablesFailed,
      reviews: rc.reviews.length,
    },
  })

  return {
    runId,
    status,
    rowsImported,
    rowsSkipped,
    rowsFailed,
    tablesSucceeded,
    tablesFailed,
    errorSummary,
  }
}

const SNAPSHOT_URI_PREFIX = 'gamma-snapshots'

interface RunStep {
  key: SnapshotFileKey
  tableName: string
  haltOnError: boolean
  runner: (rc: RunContext, file: ReturnType<typeof parseCsv>) => Promise<void>
}

const ORDERED_STEPS: RunStep[] = [
  // 1) Players must exist before anything else
  {
    key: 'players',
    tableName: 'players',
    haltOnError: true,
    runner: (rc, file) => importPlayers(rc, file),
  },
  // 2) Affiliates (must exist before attribution)
  {
    key: 'affiliates',
    tableName: 'affiliates',
    haltOnError: false,
    runner: (rc, file) => importAffiliates(rc, file),
  },
  // 3) Purchases (wallets, lifetime stats, ledger entries)
  {
    key: 'transactions',
    tableName: 'purchases',
    haltOnError: false,
    runner: (rc, file) => importPurchases(rc, file),
  },
  // 4) Redemptions (ledger entries)
  {
    key: 'redemptions',
    tableName: 'redemptions',
    haltOnError: false,
    runner: (rc, file) => importRedemptions(rc, file),
  },
  // 5) Daily KPIs (pure reporting)
  {
    key: 'daily_kpis',
    tableName: 'daily_operational_snapshots',
    haltOnError: false,
    runner: (rc, file) => importDailyKpis(rc, file),
  },
]
