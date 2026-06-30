import { reports } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/12 §4 — Layer 3 snapshot aggregations.
//
// We expose three Inngest functions:
//   1. aggregate-snapshots-hourly  — refreshes today's snapshots so dashboards
//      reading from `daily_operational_snapshots` see live numbers without
//      query-on-the-ledger every page load.
//   2. aggregate-snapshots-nightly — finalises yesterday's snapshots once the
//      day is closed.
//   3. aggregate-snapshots-rebuild — event-driven; rebuilds an arbitrary date
//      (used by the admin "Force refresh" action and recovery scripts).
//
// All three call into the same idempotent `aggregateSnapshotsForDate` so
// running them concurrently or out of order is safe.

export const aggregateSnapshotsHourly = inngest.createFunction(
  {
    id: 'aggregate-snapshots-hourly',
    name: 'Aggregate Layer 3 snapshots — today',
  },
  { cron: '5 * * * *' }, // top of the hour + 5 to avoid contention with other crons
  async ({ step }) => {
    const { ctx } = buildWorkerContext({
      loggerBindings: { job: 'aggregate-snapshots-hourly' },
    })
    return step.run('aggregate-today', async () => {
      const date = reports.today()
      const result = await reports.aggregateSnapshotsForDate(ctx.db, { date })
      ctx.logger.info('today snapshot aggregated', { ...result })
      return result
    })
  },
)

export const aggregateSnapshotsNightly = inngest.createFunction(
  {
    id: 'aggregate-snapshots-nightly',
    name: 'Aggregate Layer 3 snapshots — yesterday (final)',
  },
  { cron: '0 4 * * *' }, // 04:00 UTC, after the player-stats nightly at 02:00
  async ({ step }) => {
    const { ctx } = buildWorkerContext({
      loggerBindings: { job: 'aggregate-snapshots-nightly' },
    })
    return step.run('aggregate-yesterday', async () => {
      const date = reports.yesterday()
      const result = await reports.aggregateSnapshotsForDate(ctx.db, { date })
      ctx.logger.info('yesterday snapshot aggregated', { ...result })
      return result
    })
  },
)

export const aggregateSnapshotsRebuild = inngest.createFunction(
  {
    id: 'aggregate-snapshots-rebuild',
    name: 'Aggregate Layer 3 snapshots — manual rebuild',
  },
  { event: 'reports/aggregate-snapshots' },
  async ({ event, step }) => {
    const { ctx } = buildWorkerContext({
      loggerBindings: { job: 'aggregate-snapshots-rebuild' },
    })
    const date =
      typeof event.data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.data.date)
        ? (event.data.date as string)
        : reports.yesterday()
    return step.run('aggregate', async () => {
      const result = await reports.aggregateSnapshotsForDate(ctx.db, { date })
      ctx.logger.info('manual rebuild done', { ...result })
      return result
    })
  },
)
