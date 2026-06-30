import Link from 'next/link'
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { AlarmClock, Sparkles, Users, Wallet } from 'lucide-react'

import { vip as vipModule } from '@coinfrenzy/core'
import { PageHeader, QuickInsights } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { formatUsd } from '@/lib/format'

// M4 — Host portal dashboard. Rendered by /admin/page.tsx when the logged-in
// admin has role='host'. Replaces the operator dashboard entirely.

interface HostDashboardProps {
  hostId: string
  displayName: string
}

export async function HostDashboard({ hostId, displayName }: HostDashboardProps) {
  const db = getDb()
  // Drizzle's helpers like gte() accept Date directly, but raw `sql` template
  // literals must use ISO strings — postgres-js throws on bound Date values.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const sevenDaysAgoIso = sevenDaysAgo.toISOString()

  const [counts] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      newThisWeek: sql<number>`COUNT(*) FILTER (WHERE ${schema.players.hostAssignedAt} >= ${sevenDaysAgoIso}::timestamptz)::int`,
      totalLtv: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::text`,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(and(eq(schema.players.assignedHostId, hostId), isNull(schema.players.deletedAt)))

  const needAttention = await vipModule.getInteractionsNeedingAttention(db, hostId, {
    thresholdDays: 7,
    limit: 50,
  })

  const recentEvents = await db
    .select({
      id: schema.playerEvents.id,
      playerId: schema.playerEvents.playerId,
      kind: schema.playerEvents.eventName,
      occurredAt: schema.playerEvents.createdAt,
    })
    .from(schema.playerEvents)
    .innerJoin(
      schema.players,
      and(
        eq(schema.players.id, schema.playerEvents.playerId),
        eq(schema.players.assignedHostId, hostId),
      ),
    )
    .where(gte(schema.playerEvents.createdAt, sevenDaysAgo))
    .orderBy(desc(schema.playerEvents.createdAt))
    .limit(10)

  // Resolve player emails for the recent events.
  const playerIds = Array.from(new Set(recentEvents.map((e) => e.playerId)))
  const playerLookup =
    playerIds.length === 0
      ? new Map<string, { email: string; displayName: string | null }>()
      : new Map(
          (
            await db
              .select({
                id: schema.players.id,
                email: schema.players.email,
                displayName: schema.players.displayName,
              })
              .from(schema.players)
              .where(inArray(schema.players.id, playerIds))
          ).map((p) => [p.id, { email: p.email, displayName: p.displayName }] as const),
        )

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={`Welcome back, ${firstName(displayName)}`}
        subtitle={`${counts?.total ?? 0} VIPs · ${formatUsd(counts?.totalLtv ?? '0')} under your care`}
        breadcrumb={[{ label: 'Host Portal', href: '/admin' }, { label: 'Dashboard' }]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <QuickInsights
        insights={[
          {
            label: 'My VIPs',
            value: (counts?.total ?? 0).toString(),
            icon: <Users />,
            tone: 'positive',
            href: '/admin/vips',
          },
          {
            label: 'Need attention',
            value: needAttention.length.toString(),
            delta: needAttention.length > 0 ? 'No contact in 7+ days' : 'All up to date',
            tone: needAttention.length > 0 ? 'attention' : 'positive',
            icon: <AlarmClock />,
          },
          {
            label: 'New this week',
            value: (counts?.newThisWeek ?? 0).toString(),
            icon: <Sparkles />,
            tone: 'notice',
          },
          {
            label: 'Total LTV I manage',
            value: formatUsd(counts?.totalLtv ?? '0'),
            icon: <Wallet />,
            tone: 'neutral',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Players needing attention</CardTitle>
            <Link href="/admin/vips" className="text-sm text-brand hover:underline">
              All VIPs →
            </Link>
          </CardHeader>
          <CardContent>
            {needAttention.length === 0 ? (
              <p className="text-sm text-ink-tertiary">
                Nice — every VIP has been contacted within the last week.
              </p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="py-2 pr-4 text-left font-medium">Player</th>
                    <th className="py-2 pr-4 text-right font-medium">Lifetime spend</th>
                    <th className="py-2 pr-4 text-right font-medium">Days since contact</th>
                    <th className="py-2 pr-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {needAttention.slice(0, 15).map((v) => (
                    <tr key={v.playerId} className="border-b border-line-subtle/40">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/admin/vips/${v.playerId}`}
                          className="font-medium text-ink-primary hover:underline"
                        >
                          {v.email}
                        </Link>
                        {v.displayName ? (
                          <p className="text-xs text-ink-tertiary">{v.displayName}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatUsd(v.lifetimeSpendUsdMinor)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-attention">
                        {v.daysSinceLastInteraction === 365
                          ? 'Never'
                          : `${v.daysSinceLastInteraction}d`}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Link
                          href={`/admin/vips/${v.playerId}`}
                          className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand/90"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-ink-tertiary">No recent events from your VIPs.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentEvents.map((e) => {
                  const p = playerLookup.get(e.playerId)
                  return (
                    <li key={e.id} className="border-b border-line-subtle/40 pb-2 last:border-b-0">
                      <p className="text-ink-primary">
                        {p ? (
                          <Link
                            href={`/admin/vips/${e.playerId}`}
                            className="font-medium hover:underline"
                          >
                            {p.email}
                          </Link>
                        ) : (
                          'Player'
                        )}{' '}
                        <span className="text-ink-secondary">{prettyEvent(e.kind)}</span>
                      </p>
                      <p className="text-xs text-ink-tertiary">{relative(e.occurredAt)}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href="/admin/bonus"
            className="rounded-md border border-line-subtle bg-surface px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-hover"
          >
            Send a bonus
          </Link>
          <Link
            href="/admin/messages"
            className="rounded-md border border-line-subtle bg-surface px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-hover"
          >
            Send a message
          </Link>
          <Link
            href="/admin/vips"
            className="rounded-md border border-line-subtle bg-surface px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-hover"
          >
            View my VIPs
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function firstName(displayName: string): string {
  return displayName.split(/\s+/)[0] ?? displayName
}

function prettyEvent(kind: string): string {
  return kind.replace(/^player\./, '').replace(/[._]/g, ' ')
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
  return `${day}d ago`
}
