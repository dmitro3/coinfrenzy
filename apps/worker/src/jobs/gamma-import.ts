import { eq } from 'drizzle-orm'

import { migration } from '@coinfrenzy/core'
import { schema } from '@coinfrenzy/db'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/13 §3 — the Inngest function that executes a queued migration_runs
// row. The admin UI enqueues an event ('migration.run.start') with the
// run id; this function picks it up and calls the orchestrator. The
// orchestrator is itself synchronous-ish (it runs each step inline) but
// emitting through Inngest gives us:
//   * Retry semantics on infra failures (worker crash, DB hiccup)
//   * A consistent backpressure boundary so the UI never blocks
//   * Observability via the Inngest dashboard
//
// The function is concurrency-limited to 1 — we never want two imports
// running simultaneously against the same production database.

export const gammaImport = inngest.createFunction(
  {
    id: 'gamma-import',
    name: 'Run Gamma migration import',
    concurrency: { limit: 1 },
    retries: 1,
  },
  { event: 'migration.run.start' },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string }
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'gamma-import', runId },
    })

    // Pull the queued run row.
    const runs = await ctx.db
      .select({
        id: schema.migrationRuns.id,
        snapshotDate: schema.migrationRuns.snapshotDate,
        mode: schema.migrationRuns.mode,
        status: schema.migrationRuns.status,
        triggeredBy: schema.migrationRuns.triggeredBy,
      })
      .from(schema.migrationRuns)
      .where(eq(schema.migrationRuns.id, runId))
      .limit(1)

    const run = runs[0]
    if (!run) {
      ctx.logger.error('gamma_import_run_missing', { runId })
      return { ok: false, reason: 'run_not_found' }
    }
    if (run.status !== 'queued' && run.status !== 'running') {
      ctx.logger.info('gamma_import_skipping', { runId, status: run.status })
      return { ok: false, reason: `not_runnable:${run.status}` }
    }

    const outcome = await step.run('import', async () =>
      migration.startRun({
        ctx,
        snapshotDate: run.snapshotDate,
        mode: run.mode as 'dry_run' | 'production',
        triggeredBy: run.triggeredBy,
      }),
    )

    // After import, auto-run validation. We want every run validated;
    // operators can re-trigger by hitting /admin/migration/runs/[id]/validate.
    const validation = await step.run('validate', async () =>
      migration.validateRun({ ctx, snapshotDate: run.snapshotDate, runId: outcome.runId }),
    )

    await flushAfterCommit()
    ctx.logger.info('gamma_import_completed', {
      runId: outcome.runId,
      status: outcome.status,
      validation: validation.status,
    })
    return { ok: true, runId: outcome.runId, status: outcome.status, validation: validation.status }
  },
)

// Convenience cron stub for daily snapshot ingest. In production this is
// where we'd call into Gamma's admin export endpoint and push CSVs into
// R2; for now it logs only because Gamma's admin requires manual export.
// Operators run the upload manually via /admin/migration; this stays
// here as a hook for the future automated pull.

export const pullGammaSnapshot = inngest.createFunction(
  {
    id: 'pull-gamma-snapshot',
    name: 'Pull daily Gamma snapshot into R2',
  },
  { cron: '0 3 * * *' },
  async () => {
    const { ctx } = buildWorkerContext({ loggerBindings: { job: 'pull-gamma-snapshot' } })
    ctx.logger.info('pull_gamma_snapshot_invoked', {
      note:
        "Gamma's admin does not expose CSV pull APIs yet — operator uploads via /admin/migration. " +
        'Wire a real fetcher here when those credentials/endpoints exist.',
    })
    return { ok: true, mode: 'manual' }
  },
)
