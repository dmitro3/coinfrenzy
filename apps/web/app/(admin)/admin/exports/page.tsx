import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'
import { ExportCenterClient, type ExportListRow } from './export-center-client'
import { ScheduledReportsPanel, type SubscriptionRow } from './scheduled-reports-panel'

export const dynamic = 'force-dynamic'

export default async function ExportCenterPage() {
  const session = await requireAdminSession('/admin/exports')

  const db = getDb()
  const [exportRows, subRows] = await Promise.all([
    db.select().from(schema.dataExports).orderBy(desc(schema.dataExports.createdAt)).limit(100),
    db
      .select()
      .from(schema.reportSubscriptions)
      .where(eq(schema.reportSubscriptions.adminId, session.admin.id))
      .orderBy(desc(schema.reportSubscriptions.createdAt)),
  ])

  const data: ExportListRow[] = exportRows.map((r) => ({
    id: r.id,
    exportType: r.exportType,
    status: r.status,
    rowCount: r.rowCount,
    sizeBytes: r.sizeBytes != null ? r.sizeBytes.toString() : null,
    downloadUrl: r.downloadUrl,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    requiresReview: r.requiresReview,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }))

  const subs: SubscriptionRow[] = subRows.map((r) => ({
    id: r.id,
    reportKind: r.reportKind,
    schedule: r.schedule,
    emailTo: r.emailTo,
    emailSubject: r.emailSubject,
    enabled: r.enabled,
    lastSentAt: r.lastSentAt?.toISOString() ?? null,
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))

  const canRunCustom = session.payload.role === 'master'

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Export Center"
        description="Pre-built exports + custom queries → CSV via R2 → email link with 24h expiry."
        actions={
          canRunCustom ? (
            <Link
              href="/admin/reports/custom-query"
              className="text-sm text-primary hover:underline"
            >
              Open Custom Query Workbench →
            </Link>
          ) : null
        }
      />
      <ExportCenterClient initialRows={data} />
      <ScheduledReportsPanel initialRows={subs} defaultRecipient={session.admin.email} />
    </div>
  )
}
