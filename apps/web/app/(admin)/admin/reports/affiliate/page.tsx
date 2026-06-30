import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { formatScCompact } from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { ReportExportBar } from '../_filters'
import { AffiliateReportTable, type AffiliateRow } from './client-table'

export const dynamic = 'force-dynamic'

export default async function AffiliateReportPage() {
  await requireReportsAccess('/admin/reports/affiliate')

  const db = getDb()
  const rows = await db
    .select({
      id: schema.affiliates.id,
      username: schema.affiliates.username,
      email: schema.affiliates.email,
      displayName: schema.affiliates.displayName,
      status: schema.affiliates.status,
      revenueSharePct: schema.affiliates.revenueSharePct,
      totalSignups: schema.affiliates.totalSignupsAttributed,
      totalActive: schema.affiliates.totalActiveAttributed,
      totalNgrSc: schema.affiliates.totalNgrAttributedSc,
      totalPayoutsSc: schema.affiliates.totalPayoutsSc,
      pendingPayoutSc: schema.affiliates.pendingPayoutSc,
      lastPayoutAt: schema.affiliatePayouts.paidAt,
    })
    .from(schema.affiliates)
    .leftJoin(
      schema.affiliatePayouts,
      eq(schema.affiliatePayouts.affiliateId, schema.affiliates.id),
    )
    .where(eq(schema.affiliates.status, 'active'))
    .orderBy(desc(schema.affiliates.totalNgrAttributedSc))
    .limit(2_000)

  // Coalesce duplicate rows from the join (one per payout) into one per
  // affiliate — keep the latest paid_at.
  const map = new Map<string, AffiliateRow>()
  for (const r of rows) {
    const existing = map.get(r.id)
    const payoutAt = r.lastPayoutAt ? r.lastPayoutAt.toISOString() : null
    if (!existing) {
      map.set(r.id, {
        id: r.id,
        username: r.username,
        email: r.email,
        displayName: r.displayName,
        status: r.status,
        revenueSharePct: r.revenueSharePct,
        totalSignups: r.totalSignups,
        totalActive: r.totalActive,
        totalNgrSc: r.totalNgrSc.toString(),
        totalPayoutsSc: r.totalPayoutsSc.toString(),
        pendingPayoutSc: r.pendingPayoutSc.toString(),
        lastPayoutAt: payoutAt,
      })
    } else if (payoutAt && (!existing.lastPayoutAt || payoutAt > existing.lastPayoutAt)) {
      existing.lastPayoutAt = payoutAt
    }
  }

  const data = Array.from(map.values())

  const totalActiveAffiliates = data.length
  const totalNgr = data.reduce((acc, r) => acc + BigInt(r.totalNgrSc), 0n)
  const totalPaid = data.reduce((acc, r) => acc + BigInt(r.totalPayoutsSc), 0n)
  const totalPending = data.reduce((acc, r) => acc + BigInt(r.pendingPayoutSc), 0n)
  const totalSignupsAttr = data.reduce((acc, r) => acc + r.totalSignups, 0)
  const totalActiveAttr = data.reduce((acc, r) => acc + r.totalActive, 0)

  return (
    <ListPageShell
      title="Affiliate Report"
      subtitle={`${totalActiveAffiliates.toLocaleString()} active affiliates`}
      description="Active affiliates ranked by lifetime NGR attributed."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Affiliates' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Active affiliates',
          value: totalActiveAffiliates.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'NGR attributed',
          value: formatScCompact(totalNgr),
          tone: 'positive',
        },
        {
          label: 'Paid out',
          value: formatScCompact(totalPaid),
          tone: 'neutral',
        },
        {
          label: 'Pending payout',
          value: formatScCompact(totalPending),
          tone: totalPending > 0n ? 'attention' : 'neutral',
        },
        {
          label: 'Signups attributed',
          value: totalSignupsAttr.toLocaleString(),
          delta: `${totalActiveAttr.toLocaleString()} active`,
          tone: 'positive',
        },
      ]}
    >
      <ReportExportBar exportHref="/api/admin/reports/affiliate/export" />
      <AffiliateReportTable rows={data} />
    </ListPageShell>
  )
}
