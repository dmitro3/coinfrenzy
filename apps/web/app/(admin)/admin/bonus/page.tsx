import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Gift } from 'lucide-react'

import { isHost } from '@coinfrenzy/core/auth'
import { ListPageShell } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HostBonusPage() {
  const session = await requireAdminSession('/admin/bonus')
  if (!isHost(session.payload.role)) {
    redirect('/admin/bonus/active')
  }

  const hostId = session.admin.id
  const db = getDb()
  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))

  // Bonuses awarded by this host (via host_player_interactions of type 'bonus_sent').
  const rows = await db
    .select({
      id: schema.hostPlayerInteractions.id,
      playerId: schema.hostPlayerInteractions.playerId,
      playerEmail: schema.players.email,
      metadata: schema.hostPlayerInteractions.metadata,
      createdAt: schema.hostPlayerInteractions.createdAt,
    })
    .from(schema.hostPlayerInteractions)
    .innerJoin(schema.players, eq(schema.players.id, schema.hostPlayerInteractions.playerId))
    .where(
      and(
        eq(schema.hostPlayerInteractions.hostId, hostId),
        eq(schema.hostPlayerInteractions.interactionType, 'bonus_sent'),
        isNull(schema.players.deletedAt),
      ),
    )
    .orderBy(desc(schema.hostPlayerInteractions.createdAt))
    .limit(100)

  // Aggregations.
  const monthRows = rows.filter((r) => r.createdAt >= startOfMonth)
  const totalScThisMonth = monthRows.reduce((acc, r) => {
    const sc = ((r.metadata as Record<string, unknown> | null)?.['sc_amount'] as string) ?? '0'
    try {
      return acc + BigInt(sc)
    } catch {
      return acc
    }
  }, 0n)

  // Count unique players awarded.
  const uniquePlayers = new Set(monthRows.map((r) => r.playerId)).size

  // Most popular bonus from interactions metadata.
  const popularity: Record<string, number> = {}
  for (const r of monthRows) {
    const id = ((r.metadata as Record<string, unknown> | null)?.['bonus_id'] as string) ?? ''
    if (!id) continue
    popularity[id] = (popularity[id] ?? 0) + 1
  }
  const mostPopularBonusId = Object.entries(popularity).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  let mostPopularLabel: string = '—'
  if (mostPopularBonusId) {
    const [row] = await db
      .select({ displayName: schema.bonuses.displayName })
      .from(schema.bonuses)
      .where(eq(schema.bonuses.id, mostPopularBonusId))
      .limit(1)
    if (row) mostPopularLabel = row.displayName
  }

  return (
    <ListPageShell
      title="Send Bonus"
      subtitle="Your host bonus dashboard"
      breadcrumb={[{ label: 'Host Portal', href: '/admin' }, { label: 'Send Bonus' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Sent this month',
          value: monthRows.length.toString(),
          icon: <Gift />,
          tone: 'positive',
        },
        {
          label: 'Total SC awarded (month)',
          value: `${formatCoins(totalScThisMonth)} SC`,
          tone: 'neutral',
        },
        {
          label: 'Most popular',
          value: mostPopularLabel,
          tone: 'neutral',
        },
        {
          label: 'Players awarded',
          value: uniquePlayers.toString(),
          tone: 'neutral',
        },
      ]}
    >
      <div className="rounded-md border border-line-subtle bg-surface px-4 py-3 text-sm text-ink-secondary">
        Pick a VIP from your{' '}
        <Link href="/admin/vips" className="text-brand hover:underline">
          My VIPs
        </Link>{' '}
        list and use the &ldquo;Send bonus&rdquo; action on their detail page. Weekly cap: $500 SC
        per player.
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-tertiary">No bonuses sent yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">Player</th>
                    <th className="px-4 py-3 text-right font-medium">SC amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sc =
                      ((r.metadata as Record<string, unknown> | null)?.['sc_amount'] as string) ??
                      '0'
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-line-subtle/40 hover:bg-surface-hover/40"
                      >
                        <td className="px-4 py-3 text-ink-tertiary">
                          {r.createdAt.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/vips/${r.playerId}`}
                            className="text-ink-primary hover:underline"
                          >
                            {r.playerEmail}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                          {formatCoins(sc)} SC
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
