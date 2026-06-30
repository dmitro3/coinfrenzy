import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'

import { hasAtLeast } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'

import { MigrationRunDetailClient } from './run-detail-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface Params {
  params: Promise<{ id: string }>
}

export default async function MigrationRunDetailPage({ params }: Params) {
  const { id } = await params
  const session = await requireAdminSession(`/admin/migration/${id}`)
  if (!hasAtLeast(session.payload.role, 'master')) {
    redirect('/admin')
  }

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.migrationRuns)
    .where(eq(schema.migrationRuns.id, id))
    .limit(1)
  const run = rows[0]
  if (!run) notFound()

  const tables = await db
    .select()
    .from(schema.migrationImports)
    .where(eq(schema.migrationImports.runId, id))

  const errors = await db
    .select()
    .from(schema.migrationRowErrors)
    .where(eq(schema.migrationRowErrors.runId, id))
    .orderBy(desc(schema.migrationRowErrors.createdAt))
    .limit(100)

  const reviews = await db
    .select()
    .from(schema.migrationReviewQueue)
    .where(eq(schema.migrationReviewQueue.runId, id))
    .orderBy(desc(schema.migrationReviewQueue.createdAt))

  const replays = await db
    .select()
    .from(schema.migrationReplayLog)
    .where(eq(schema.migrationReplayLog.runId, id))
    .orderBy(desc(schema.migrationReplayLog.replayedAt))
    .limit(100)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`Migration run ${id.slice(0, 8)}`}
        subtitle={`${run.snapshotDate} · ${run.mode}`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Migration', href: '/admin/migration' },
          { label: id.slice(0, 8) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <MigrationRunDetailClient
        run={{
          id: run.id,
          snapshotDate: run.snapshotDate,
          snapshotUri: run.snapshotUri,
          mode: run.mode as 'dry_run' | 'production',
          status: run.status,
          tablesTotal: run.tablesTotal,
          tablesSucceeded: run.tablesSucceeded,
          tablesFailed: run.tablesFailed,
          rowsImported: run.rowsImported,
          rowsFailed: run.rowsFailed,
          validationStatus: run.validationStatus,
          validationSummary: run.validationSummary as Record<string, unknown> | null,
          triggeredAt: run.triggeredAt.toISOString(),
          completedAt: run.completedAt ? run.completedAt.toISOString() : null,
          errorSummary: run.errorSummary,
          notes: run.notes,
        }}
        tables={tables.map((t) => ({
          id: t.id,
          tableName: t.tableName,
          source: t.source,
          rowsInSource: t.rowsInSource,
          rowsImported: t.rowsImported,
          rowsSkipped: t.rowsSkipped,
          rowsFailed: t.rowsFailed,
          status: t.status,
          errorSummary: t.errorSummary,
        }))}
        errors={errors.map((e) => ({
          id: e.id,
          sourceFile: e.sourceFile,
          sourceRowNumber: e.sourceRowNumber,
          sourceRowId: e.sourceRowId,
          errorCode: e.errorCode,
          errorMessage: e.errorMessage,
          errorField: e.errorField,
          createdAt: e.createdAt.toISOString(),
        }))}
        reviews={reviews.map((r) => ({
          id: r.id,
          kind: r.kind,
          sourceFile: r.sourceFile,
          sourceText: r.sourceText,
          sourceRowId: r.sourceRowId,
          status: r.status,
          suggestion: r.suggestion as Record<string, unknown> | null,
          resolutionNotes: r.resolutionNotes,
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        }))}
        replays={replays.map((r) => ({
          id: r.id,
          provider: r.provider,
          eventType: r.eventType,
          receivedAt: r.receivedAt.toISOString(),
          replayedAt: r.replayedAt.toISOString(),
          outcome: r.outcome,
          error: r.error,
        }))}
      />
    </div>
  )
}
