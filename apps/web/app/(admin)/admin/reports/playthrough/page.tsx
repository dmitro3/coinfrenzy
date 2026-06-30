import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { defaultLast30Days, formatHumanRange, parseDateRange } from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { PlaythroughTable, type PlaythroughRow } from './client-table'
import { DateRangeFilter } from '../_filters'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PlaythroughPage({ searchParams }: PageProps) {
  await requireReportsAccess('/admin/reports/playthrough')
  const range = parseDateRange(await searchParams)

  const db = getDb()
  const rows = (await db.execute<{
    bonus_type: string
    awarded: string
    completed: string
    expired: string
    forfeited: string
    avg_completion_hours: string | null
    avg_progress_pct: string | null
  }>(sql`
    SELECT
      b.bonus_type::text AS bonus_type,
      COUNT(ba.id)::text AS awarded,
      COUNT(ba.id) FILTER (WHERE ba.status = 'completed')::text AS completed,
      COUNT(ba.id) FILTER (WHERE ba.status = 'expired')::text AS expired,
      COUNT(ba.id) FILTER (WHERE ba.status = 'forfeited')::text AS forfeited,
      AVG(EXTRACT(EPOCH FROM (ba.completed_at - ba.created_at)) / 3600.0)
        FILTER (WHERE ba.status = 'completed')::text AS avg_completion_hours,
      AVG(
        CASE WHEN ba.playthrough_required > 0
          THEN ba.playthrough_progress::numeric / ba.playthrough_required::numeric
          ELSE NULL END
      )::text AS avg_progress_pct
    FROM bonuses b
    LEFT JOIN bonuses_awarded ba ON ba.bonus_id = b.id
      AND ba.created_at >= ${range.from}::date
      AND ba.created_at < (${range.to}::date + INTERVAL '1 day')
    GROUP BY b.bonus_type
    ORDER BY b.bonus_type
  `)) as unknown as Array<{
    bonus_type: string
    awarded: string
    completed: string
    expired: string
    forfeited: string
    avg_completion_hours: string | null
    avg_progress_pct: string | null
  }>

  const data: PlaythroughRow[] = rows.map((r) => {
    const awarded = Number(r.awarded)
    const completed = Number(r.completed)
    const expired = Number(r.expired)
    const forfeited = Number(r.forfeited)
    return {
      bonusType: r.bonus_type,
      awarded,
      completed,
      expired,
      forfeited,
      completionRate: awarded > 0 ? (completed / awarded) * 100 : 0,
      expiryRate: awarded > 0 ? (expired / awarded) * 100 : 0,
      forfeitRate: awarded > 0 ? (forfeited / awarded) * 100 : 0,
      avgCompletionHours: r.avg_completion_hours ? Number(r.avg_completion_hours) : null,
      avgProgressPct: r.avg_progress_pct ? Number(r.avg_progress_pct) * 100 : null,
    }
  })

  const totalAwarded = data.reduce((acc, r) => acc + r.awarded, 0)
  const totalCompleted = data.reduce((acc, r) => acc + r.completed, 0)
  const totalExpired = data.reduce((acc, r) => acc + r.expired, 0)
  const totalForfeited = data.reduce((acc, r) => acc + r.forfeited, 0)
  const overallCompletionPct =
    totalAwarded > 0 ? `${((totalCompleted / totalAwarded) * 100).toFixed(1)}%` : '—'
  const overallExpiryPct =
    totalAwarded > 0 ? `${((totalExpired / totalAwarded) * 100).toFixed(1)}%` : '—'
  const completionTimes = data
    .map((r) => r.avgCompletionHours)
    .filter((v): v is number => v !== null && Number.isFinite(v))
  const avgCompletionTime =
    completionTimes.length > 0
      ? `${(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1)}h`
      : '—'

  const fallback = defaultLast30Days()

  return (
    <ListPageShell
      title="Playthrough"
      subtitle={formatHumanRange(range)}
      description="Per-bonus playthrough velocity — completion rate, expiry rate, forfeit rate, time-to-complete."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Playthrough' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Awarded',
          value: totalAwarded.toLocaleString(),
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
        {
          label: 'Forfeited',
          value: totalForfeited.toLocaleString(),
          delta: totalAwarded > 0 ? `${((totalForfeited / totalAwarded) * 100).toFixed(1)}%` : '—',
          tone: totalForfeited > 0 ? 'attention' : 'neutral',
        },
        {
          label: 'Avg time to complete',
          value: avgCompletionTime,
          delta: 'across bonus types with completions',
          tone: 'neutral',
        },
      ]}
    >
      <DateRangeFilter
        from={range.from}
        to={range.to}
        fallbackFrom={fallback.from}
        fallbackTo={fallback.to}
        exportHref="/api/admin/reports/playthrough/export"
      />
      <PlaythroughTable rows={data} />
    </ListPageShell>
  )
}
