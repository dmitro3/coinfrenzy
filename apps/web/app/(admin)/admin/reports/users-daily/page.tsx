import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { formatUsdCompact } from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { ReportExportBar } from '../_filters'
import { UsersDailyTable, type CohortRow } from './client-table'

export const dynamic = 'force-dynamic'

export default async function UsersDailyPage() {
  await requireReportsAccess('/admin/reports/users-daily')

  const db = getDb()
  const rows = (await db.execute<{
    cohort_week: string
    cohort_size: string
    week_active: string
    cohort_paying: string
    cohort_total_deposit: string
  }>(sql`
    SELECT
      to_char(date_trunc('week', p.first_seen_at), 'YYYY-MM-DD') AS cohort_week,
      COUNT(DISTINCT p.id)::text AS cohort_size,
      COUNT(DISTINCT CASE WHEN p.last_seen_at > NOW() - INTERVAL '7 days' THEN p.id END)::text AS week_active,
      COUNT(DISTINCT CASE WHEN pls.total_deposited_usd > 0 THEN p.id END)::text AS cohort_paying,
      COALESCE(SUM(pls.total_deposited_usd), 0)::text AS cohort_total_deposit
    FROM players p
    LEFT JOIN player_lifetime_stats pls ON pls.player_id = p.id
    WHERE p.first_seen_at > NOW() - INTERVAL '6 months'
      AND p.is_internal_account = false
      AND p.deleted_at IS NULL
    GROUP BY date_trunc('week', p.first_seen_at)
    ORDER BY cohort_week DESC
  `)) as unknown as Array<{
    cohort_week: string
    cohort_size: string
    week_active: string
    cohort_paying: string
    cohort_total_deposit: string
  }>

  const data: CohortRow[] = rows.map((r) => {
    const size = Number(r.cohort_size)
    const active = Number(r.week_active)
    const paying = Number(r.cohort_paying)
    return {
      cohortWeek: r.cohort_week,
      cohortSize: size,
      weekActive: active,
      retainedPct: size > 0 ? (active / size) * 100 : 0,
      cohortPaying: paying,
      payingPct: size > 0 ? (paying / size) * 100 : 0,
      cohortDepositUsd: parseDecimal(r.cohort_total_deposit),
    }
  })

  const totalSignups = data.reduce((acc, r) => acc + r.cohortSize, 0)
  const totalPaying = data.reduce((acc, r) => acc + r.cohortPaying, 0)
  const totalActive = data.reduce((acc, r) => acc + r.weekActive, 0)
  const totalDeposited = data.reduce((acc, r) => acc + BigInt(r.cohortDepositUsd), 0n)
  const avgRetention =
    totalSignups > 0 ? `${((totalActive / totalSignups) * 100).toFixed(1)}%` : '—'
  const conversionRate =
    totalSignups > 0 ? `${((totalPaying / totalSignups) * 100).toFixed(1)}%` : '—'

  return (
    <ListPageShell
      title="Users Daily"
      subtitle={`${data.length} weekly cohorts (last 6 months)`}
      description="Signup-week cohorts — who is still active, who pays, and how much they have purchased."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Users Daily' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Total signups (6mo)',
          value: totalSignups.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Active last 7d',
          value: totalActive.toLocaleString(),
          delta: `${avgRetention} retention rate`,
          tone: 'positive',
        },
        {
          label: 'Paying users',
          value: totalPaying.toLocaleString(),
          delta: `${conversionRate} conversion`,
          tone: 'positive',
        },
        {
          label: 'Total purchased',
          value: formatUsdCompact(totalDeposited),
          tone: 'positive',
        },
        {
          label: 'Avg per paying',
          value: totalPaying > 0 ? formatUsdCompact(totalDeposited / BigInt(totalPaying)) : '—',
          tone: 'neutral',
        },
      ]}
    >
      <ReportExportBar exportHref="/api/admin/reports/users-daily/export" />
      <UsersDailyTable rows={data} />
    </ListPageShell>
  )
}

function parseDecimal(s: string): string {
  if (!s || s === '0') return '0'
  const negative = s.startsWith('-')
  const abs = negative ? s.slice(1) : s
  const [whole = '0', fraction = ''] = abs.split('.')
  const padded = fraction.padEnd(4, '0').slice(0, 4)
  const combined = `${whole}${padded}`.replace(/^0+(\d)/, '$1') || '0'
  return `${negative ? '-' : ''}${combined}`
}
