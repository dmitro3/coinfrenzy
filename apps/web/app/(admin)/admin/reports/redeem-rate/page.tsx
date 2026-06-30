import Link from 'next/link'
import { and, desc, gte, lte } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import {
  defaultLast30Days,
  formatHumanRange,
  formatMoney,
  formatUsdCompact,
  parseDateRange,
} from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { RedeemRateTable, type RedeemRateRow } from './client-table'
import { DateRangeFilter } from '../_filters'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RedeemRatePage({ searchParams }: PageProps) {
  await requireReportsAccess('/admin/reports/redeem-rate')
  const range = parseDateRange(await searchParams)

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.dailyRedemptionRateSnapshot)
    .where(
      and(
        gte(schema.dailyRedemptionRateSnapshot.date, range.from),
        lte(schema.dailyRedemptionRateSnapshot.date, range.to),
      ),
    )
    .orderBy(desc(schema.dailyRedemptionRateSnapshot.date))

  const data: RedeemRateRow[] = rows.map((r) => ({
    date: String(r.date),
    revenueUsd: r.revenueUsd.toString(),
    redemptionsUsd: r.redemptionsUsd.toString(),
    pendingUsd: r.pendingUsd.toString(),
    cumulativeRevenueUsd: r.cumulativeRevenueUsd.toString(),
    cumulativeRedemptionsUsd: r.cumulativeRedemptionsUsd.toString(),
    dailyRedemptionRate: r.dailyRedemptionRate,
    lifetimeRedemptionRate: r.lifetimeRedemptionRate,
  }))

  const lifetime = data.length > 0 ? data[0]!.lifetimeRedemptionRate : null
  const dailyRates = data
    .map((r) => (r.dailyRedemptionRate ? Number(r.dailyRedemptionRate) : null))
    .filter((v): v is number => v !== null && !Number.isNaN(v))
  const avgDailyRate =
    dailyRates.length > 0
      ? `${((dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length) * 100).toFixed(2)}%`
      : '—'
  const peakRate = dailyRates.length > 0 ? Math.max(...dailyRates) : null
  const troughRate = dailyRates.length > 0 ? Math.min(...dailyRates) : null

  const totalRevenue = data.reduce((acc, r) => acc + BigInt(r.revenueUsd), 0n)
  const totalRedemptions = data.reduce((acc, r) => acc + BigInt(r.redemptionsUsd), 0n)

  const fallback = defaultLast30Days()

  return (
    <ListPageShell
      title="Redeem Rate"
      subtitle={formatHumanRange(range)}
      description="Per-day redemption rate (USD redeemed / USD purchased). Source: daily_redemption_rate_snapshot."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Redeem Rate' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Lifetime rate',
          value: lifetime ? `${(Number(lifetime) * 100).toFixed(2)}%` : '—',
          delta: 'latest snapshot',
          tone: 'neutral',
        },
        {
          label: 'Avg daily rate',
          value: avgDailyRate,
          delta: `${dailyRates.length} days in window`,
          tone: 'neutral',
        },
        {
          label: 'Peak day',
          value: peakRate !== null ? `${(peakRate * 100).toFixed(2)}%` : '—',
          tone: 'attention',
        },
        {
          label: 'Low day',
          value: troughRate !== null ? `${(troughRate * 100).toFixed(2)}%` : '—',
          tone: 'positive',
        },
        {
          label: 'Window net',
          value: formatUsdCompact(totalRevenue - totalRedemptions),
          delta: `${formatUsdCompact(totalRevenue)} in / ${formatUsdCompact(totalRedemptions)} out`,
          tone: totalRevenue > totalRedemptions ? 'positive' : 'critical',
        },
      ]}
    >
      <DateRangeFilter
        from={range.from}
        to={range.to}
        fallbackFrom={fallback.from}
        fallbackTo={fallback.to}
        exportHref="/api/admin/reports/redeem-rate/export"
      />
      <RedeemRateTable rows={data} formatMoney={formatMoney} />
    </ListPageShell>
  )
}
