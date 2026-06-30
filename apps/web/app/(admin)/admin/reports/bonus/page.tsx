import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import {
  defaultLast30Days,
  formatHumanRange,
  formatScCompact,
  parseDateRange,
} from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { BonusReportTable, type BonusReportRow } from './client-table'
import { DateRangeFilter } from '../_filters'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function BonusReportPage({ searchParams }: PageProps) {
  await requireReportsAccess('/admin/reports/bonus')
  const range = parseDateRange(await searchParams)

  const db = getDb()
  const rows = (await db.execute<{
    bonus_type: string
    awarded_count: string
    total_sc: string
    total_gc: string
    completed_count: string
    expired_count: string
    forfeited_count: string
    avg_playthrough_progress: string | null
  }>(sql`
    SELECT
      b.bonus_type::text AS bonus_type,
      COUNT(ba.id)::text AS awarded_count,
      COALESCE(SUM(ba.sc_amount), 0)::text AS total_sc,
      COALESCE(SUM(ba.gc_amount), 0)::text AS total_gc,
      COUNT(ba.id) FILTER (WHERE ba.status = 'completed')::text AS completed_count,
      COUNT(ba.id) FILTER (WHERE ba.status = 'expired')::text AS expired_count,
      COUNT(ba.id) FILTER (WHERE ba.status = 'forfeited')::text AS forfeited_count,
      AVG(
        CASE WHEN ba.playthrough_required > 0
          THEN ba.playthrough_progress::numeric / ba.playthrough_required::numeric
          ELSE NULL END
      )::text AS avg_playthrough_progress
    FROM bonuses b
    LEFT JOIN bonuses_awarded ba ON ba.bonus_id = b.id
      AND ba.created_at >= ${range.from}::date
      AND ba.created_at < (${range.to}::date + INTERVAL '1 day')
    GROUP BY b.bonus_type
    ORDER BY total_sc DESC NULLS LAST
  `)) as unknown as Array<{
    bonus_type: string
    awarded_count: string
    total_sc: string
    total_gc: string
    completed_count: string
    expired_count: string
    forfeited_count: string
    avg_playthrough_progress: string | null
  }>

  const data: BonusReportRow[] = rows.map((r) => ({
    bonusType: r.bonus_type,
    awardedCount: Number(r.awarded_count),
    totalSc: parseDecimal(r.total_sc),
    totalGc: parseDecimal(r.total_gc),
    completedCount: Number(r.completed_count),
    expiredCount: Number(r.expired_count),
    forfeitedCount: Number(r.forfeited_count),
    avgPlaythroughProgress:
      r.avg_playthrough_progress !== null ? Number(r.avg_playthrough_progress).toFixed(2) : null,
  }))

  const totalAwards = data.reduce((acc, r) => acc + r.awardedCount, 0)
  const totalSc = data.reduce((acc, r) => acc + BigInt(r.totalSc), 0n)
  const totalGc = data.reduce((acc, r) => acc + BigInt(r.totalGc), 0n)
  const totalCompleted = data.reduce((acc, r) => acc + r.completedCount, 0)
  const totalExpired = data.reduce((acc, r) => acc + r.expiredCount, 0)
  const overallCompletionPct =
    totalAwards > 0 ? `${((totalCompleted / totalAwards) * 100).toFixed(1)}%` : '—'
  const overallExpiryPct =
    totalAwards > 0 ? `${((totalExpired / totalAwards) * 100).toFixed(1)}%` : '—'

  const fallback = defaultLast30Days()

  return (
    <ListPageShell
      title="Bonus Report"
      subtitle={formatHumanRange(range)}
      description="Per-bonus-type award totals & completion rates, filtered by award-date window."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Bonus Report' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Total awards',
          value: totalAwards.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'SC awarded',
          value: formatScCompact(totalSc),
          tone: 'positive',
        },
        {
          label: 'GC awarded',
          value: formatScCompact(totalGc).replace('SC', 'GC'),
          tone: 'neutral',
        },
        {
          label: 'Completion',
          value: overallCompletionPct,
          delta: `${totalCompleted.toLocaleString()} completed`,
          tone: 'positive',
        },
        {
          label: 'Expiry',
          value: overallExpiryPct,
          delta: `${totalExpired.toLocaleString()} expired`,
          tone: totalExpired > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <DateRangeFilter
        from={range.from}
        to={range.to}
        fallbackFrom={fallback.from}
        fallbackTo={fallback.to}
        exportHref="/api/admin/reports/bonus/export"
      />
      <BonusReportTable rows={data} />
    </ListPageShell>
  )
}

/** Convert a Postgres `numeric` text representation to a minor-unit base-10 string. */
function parseDecimal(s: string): string {
  if (!s || s === '0') return '0'
  const negative = s.startsWith('-')
  const abs = negative ? s.slice(1) : s
  const [whole = '0', fraction = ''] = abs.split('.')
  const padded = fraction.padEnd(4, '0').slice(0, 4)
  const combined = `${whole}${padded}`.replace(/^0+(\d)/, '$1') || '0'
  return `${negative ? '-' : ''}${combined}`
}
