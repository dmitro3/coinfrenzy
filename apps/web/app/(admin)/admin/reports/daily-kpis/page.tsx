import Link from 'next/link'
import { and, desc, gte, lte } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import {
  defaultLast30Days,
  formatHumanRange,
  formatUsdCompact,
  formatScCompact,
  parseDateRange,
} from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { DailyKpisTable, type DailyKpiRow } from './client-table'
import { DateRangeFilter } from '../_filters'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DailyKpisPage({ searchParams }: PageProps) {
  await requireReportsAccess('/admin/reports/daily-kpis')
  const range = parseDateRange(await searchParams)

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.dailyOperationalSnapshots)
    .where(
      and(
        gte(schema.dailyOperationalSnapshots.date, range.from),
        lte(schema.dailyOperationalSnapshots.date, range.to),
      ),
    )
    .orderBy(desc(schema.dailyOperationalSnapshots.date))

  const data: DailyKpiRow[] = rows.map((r) => ({
    date: String(r.date),
    dayOfWeek: r.dayOfWeek,
    dau: r.dau,
    uniqueLogins: r.uniqueLogins,
    newRegistered: r.newRegisteredPlayers,
    totalScStaked: r.totalScStaked.toString(),
    totalScWon: r.totalScWon.toString(),
    totalGgrSc: r.totalGgrSc.toString(),
    totalNgrSc: r.totalNgrSc.toString(),
    totalDepositsUsd: r.totalDepositsUsd.toString(),
    depositorsCount: r.depositorsCount,
    firstTimePurchasers: r.firstTimePurchasers,
    withdrawalsCompletedUsd: r.withdrawalsCompletedUsd.toString(),
    bonusTotal: r.bonusTotal.toString(),
    abpPerDau: r.abpPerDau,
    aggrPerDau: r.aggrPerDau,
    angrPerDau: r.angrPerDau,
  }))

  // Window aggregates — sum across the selected range. Reports tiles always
  // reflect the filter applied, not all-time. (For all-time, choose the
  // "All time" preset.)
  const totalDeposits = data.reduce((acc, r) => acc + BigInt(r.totalDepositsUsd), 0n)
  const totalRedemptions = data.reduce((acc, r) => acc + BigInt(r.withdrawalsCompletedUsd), 0n)
  const totalGgr = data.reduce((acc, r) => acc + BigInt(r.totalGgrSc), 0n)
  const totalNgr = data.reduce((acc, r) => acc + BigInt(r.totalNgrSc), 0n)
  const totalSignups = data.reduce((acc, r) => acc + r.newRegistered, 0)
  const avgDau = data.length > 0 ? Math.round(data.reduce((a, r) => a + r.dau, 0) / data.length) : 0
  const redeemRate =
    totalDeposits > 0n
      ? `${((Number(totalRedemptions) / Number(totalDeposits)) * 100).toFixed(1)}%`
      : '—'

  const fallback = defaultLast30Days()

  return (
    <ListPageShell
      title="Daily KPIs"
      subtitle={formatHumanRange(range)}
      description="One row per day from daily_operational_snapshots — the MERV-equivalent."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Daily KPIs' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Avg DAU',
          value: avgDau.toLocaleString(),
          delta: `${data.length} days in window`,
          tone: 'neutral',
        },
        {
          label: 'Signups',
          value: totalSignups.toLocaleString(),
          tone: 'positive',
        },
        {
          label: 'Purchases',
          value: formatUsdCompact(totalDeposits),
          tone: 'positive',
        },
        {
          label: 'GGR',
          value: formatScCompact(totalGgr),
          delta: `NGR ${formatScCompact(totalNgr)}`,
          tone: 'positive',
        },
        {
          label: 'Redeem rate',
          value: redeemRate,
          delta: `${formatUsdCompact(totalRedemptions)} paid out`,
          tone: 'neutral',
        },
      ]}
    >
      <DateRangeFilter
        from={range.from}
        to={range.to}
        fallbackFrom={fallback.from}
        fallbackTo={fallback.to}
        exportHref="/api/admin/reports/daily-kpis/export"
      />
      <DailyKpisTable rows={data} />
    </ListPageShell>
  )
}
