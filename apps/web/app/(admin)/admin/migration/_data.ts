import { desc, eq } from 'drizzle-orm'

import { migration } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// docs/13 — server-side fetchers for the /admin/migration page.

export interface MigrationRunRow {
  id: string
  snapshotDate: string
  snapshotUri: string
  mode: 'dry_run' | 'production'
  status: string
  tablesTotal: number
  tablesSucceeded: number
  tablesFailed: number
  rowsImported: number
  rowsFailed: number
  validationStatus: string | null
  triggeredAt: string
  completedAt: string | null
  errorSummary: string | null
}

export interface MigrationSnapshotInfo {
  date: string
  files: string[]
}

export async function getMigrationDashboardData(): Promise<{
  runs: MigrationRunRow[]
  snapshots: MigrationSnapshotInfo[]
  storeMode: 'real' | 'memory'
  dualCapture: migration.DualCaptureConfig
  openReviews: number
}> {
  const db = getDb()

  const runs = await db
    .select({
      id: schema.migrationRuns.id,
      snapshotDate: schema.migrationRuns.snapshotDate,
      snapshotUri: schema.migrationRuns.snapshotUri,
      mode: schema.migrationRuns.mode,
      status: schema.migrationRuns.status,
      tablesTotal: schema.migrationRuns.tablesTotal,
      tablesSucceeded: schema.migrationRuns.tablesSucceeded,
      tablesFailed: schema.migrationRuns.tablesFailed,
      rowsImported: schema.migrationRuns.rowsImported,
      rowsFailed: schema.migrationRuns.rowsFailed,
      validationStatus: schema.migrationRuns.validationStatus,
      triggeredAt: schema.migrationRuns.triggeredAt,
      completedAt: schema.migrationRuns.completedAt,
      errorSummary: schema.migrationRuns.errorSummary,
    })
    .from(schema.migrationRuns)
    .orderBy(desc(schema.migrationRuns.triggeredAt))
    .limit(50)

  const store = migration.getSnapshotStore()
  const dates = await store.listSnapshots()
  const snapshots: MigrationSnapshotInfo[] = []
  for (const d of dates.slice(0, 14)) {
    snapshots.push({ date: d, files: await store.listFiles(d) })
  }

  const dualCapture = await migration.getDualCaptureConfig(db)

  const openReviewRows = await db
    .select({ id: schema.migrationReviewQueue.id })
    .from(schema.migrationReviewQueue)
    .where(eq(schema.migrationReviewQueue.status, 'open'))

  return {
    runs: runs.map((r) => ({
      id: r.id,
      snapshotDate: r.snapshotDate,
      snapshotUri: r.snapshotUri,
      mode: r.mode as 'dry_run' | 'production',
      status: r.status,
      tablesTotal: r.tablesTotal,
      tablesSucceeded: r.tablesSucceeded,
      tablesFailed: r.tablesFailed,
      rowsImported: r.rowsImported,
      rowsFailed: r.rowsFailed,
      validationStatus: r.validationStatus,
      triggeredAt: r.triggeredAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      errorSummary: r.errorSummary,
    })),
    snapshots,
    storeMode: store.mode,
    dualCapture,
    openReviews: openReviewRows.length,
  }
}
