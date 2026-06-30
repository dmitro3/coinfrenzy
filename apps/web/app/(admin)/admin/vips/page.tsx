import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm'
import { AlarmClock, Sparkles, Users, Wallet } from 'lucide-react'

import { isHost } from '@coinfrenzy/core/auth'
import { ListPageShell, VipBadge } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type Quick = 'all' | 'attention' | 'hot' | 'dormant' | 'high_value'

export default async function HostVipsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/vips')
  if (!isHost(session.payload.role)) {
    // Master/manager wanting all VIPs go to /admin/vip/all-vips instead.
    redirect('/admin/vip/all-vips')
  }

  const sp = await searchParams
  const quick = (typeof sp.q === 'string' ? sp.q : 'all') as Quick
  const hostId = session.admin.id
  const db = getDb()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  // ISO copies for raw `sql` templates — postgres-js refuses Date params.
  const sevenDaysAgoIso = sevenDaysAgo.toISOString()
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  const whereConds = [eq(schema.players.assignedHostId, hostId), isNull(schema.players.deletedAt)]

  if (quick === 'hot') {
    whereConds.push(gte(schema.players.lastSeenAt, sevenDaysAgo))
  } else if (quick === 'dormant') {
    whereConds.push(
      or(lt(schema.players.lastSeenAt, thirtyDaysAgo), isNull(schema.players.lastSeenAt))!,
    )
  } else if (quick === 'high_value') {
    whereConds.push(eq(schema.players.vipStatus, 'high_roller'))
  }

  const rows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      vipStatus: schema.players.vipStatus,
      lastSeenAt: schema.players.lastSeenAt,
      spend: schema.playerLifetimeStats.totalDepositedUsd,
      lastInteractionAt: sql<Date | null>`(
        SELECT MAX(${schema.hostPlayerInteractions.createdAt})
        FROM ${schema.hostPlayerInteractions}
        WHERE ${schema.hostPlayerInteractions.hostId} = ${hostId}
          AND ${schema.hostPlayerInteractions.playerId} = ${schema.players.id}
      )`,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(and(...whereConds))
    .orderBy(desc(sql<string>`COALESCE(${schema.playerLifetimeStats.totalDepositedUsd}, 0)`))

  // Filter by "attention" client side because it depends on lastInteractionAt.
  const filtered =
    quick === 'attention'
      ? rows.filter(
          (r) => r.lastInteractionAt == null || new Date(r.lastInteractionAt) < sevenDaysAgo,
        )
      : rows

  const [totals] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active7d: sql<number>`COUNT(*) FILTER (WHERE ${schema.players.lastSeenAt} >= ${sevenDaysAgoIso}::timestamptz)::int`,
      dormant30d: sql<number>`COUNT(*) FILTER (WHERE ${schema.players.lastSeenAt} < ${thirtyDaysAgoIso}::timestamptz OR ${schema.players.lastSeenAt} IS NULL)::int`,
      totalLtv: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::text`,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(and(eq(schema.players.assignedHostId, hostId), isNull(schema.players.deletedAt)))

  return (
    <ListPageShell
      title="My VIPs"
      subtitle={`${filtered.length} of ${totals?.total ?? 0} shown`}
      breadcrumb={[{ label: 'Host Portal', href: '/admin' }, { label: 'My VIPs' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'My VIPs',
          value: (totals?.total ?? 0).toString(),
          icon: <Users />,
          tone: 'positive',
        },
        {
          label: 'Active 7d',
          value: (totals?.active7d ?? 0).toString(),
          icon: <Sparkles />,
          tone: 'positive',
        },
        {
          label: 'Dormant 30d+',
          value: (totals?.dormant30d ?? 0).toString(),
          icon: <AlarmClock />,
          tone: (totals?.dormant30d ?? 0) > 0 ? 'attention' : 'neutral',
        },
        {
          label: 'Total LTV',
          value: formatUsd(totals?.totalLtv ?? '0'),
          icon: <Wallet />,
          tone: 'neutral',
        },
      ]}
    >
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['attention', 'Need attention'],
            ['hot', 'Hot this week'],
            ['dormant', 'Dormant'],
            ['high_value', 'High value'],
          ] as [Quick, string][]
        ).map(([q, l]) => (
          <Link
            key={q}
            href={q === 'all' ? '/admin/vips' : `/admin/vips?q=${q}`}
            className={
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
              (quick === q
                ? 'bg-brand text-white'
                : 'bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink-primary')
            }
          >
            {l}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-tertiary">
              No VIPs match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="px-4 py-3 text-left font-medium">Player</th>
                    <th className="px-4 py-3 text-right font-medium">Lifetime spend</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Last seen</th>
                    <th className="px-4 py-3 text-left font-medium">Last contact</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const lastInteraction = r.lastInteractionAt
                      ? new Date(r.lastInteractionAt)
                      : null
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-line-subtle/40 hover:bg-surface-hover/40"
                      >
                        <td className="px-4 py-3">
                          <Link href={`/admin/vips/${r.id}`} className="hover:underline">
                            <p className="font-medium text-ink-primary">{r.email}</p>
                            {r.displayName ? (
                              <p className="text-xs text-ink-tertiary">{r.displayName}</p>
                            ) : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                          {formatUsd(r.spend ?? 0n)}
                        </td>
                        <td className="px-4 py-3">
                          <VipBadge
                            status={r.vipStatus as 'vip' | 'high_roller' | 'candidate'}
                            compact
                          />
                        </td>
                        <td className="px-4 py-3 text-ink-tertiary">
                          {r.lastSeenAt ? relative(new Date(r.lastSeenAt)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-ink-tertiary">
                          {lastInteraction ? relative(lastInteraction) : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/vips/${r.id}`}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}

function relative(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return d.toLocaleDateString()
}
