import { redirect } from 'next/navigation'
import Link from 'next/link'
import { and, eq, sql } from 'drizzle-orm'
import { Sparkles } from 'lucide-react'

import { canViewBonuses } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/bonus/active')
  if (!canViewBonuses(session.payload.role)) {
    redirect('/admin')
  }

  const db = getDb()
  const rows = await db
    .select({
      id: schema.bonusesAwarded.id,
      playerId: schema.bonusesAwarded.playerId,
      playerEmail: schema.players.email,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      scAmount: schema.bonusesAwarded.scAmount,
      gcAmount: schema.bonusesAwarded.gcAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      playthroughComplete: schema.bonusesAwarded.playthroughComplete,
      expiresAt: schema.bonusesAwarded.expiresAt,
      createdAt: schema.bonusesAwarded.createdAt,
      awardReason: schema.bonusesAwarded.awardReason,
    })
    .from(schema.bonusesAwarded)
    .innerJoin(schema.bonuses, eq(schema.bonusesAwarded.bonusId, schema.bonuses.id))
    .innerJoin(schema.players, eq(schema.bonusesAwarded.playerId, schema.players.id))
    .where(and(eq(schema.bonusesAwarded.status, 'active')))
    .orderBy(sql`${schema.bonusesAwarded.createdAt} desc`)
    .limit(200)

  const totalSc = rows.reduce((s, r) => s + r.scAmount, 0n)
  const completed = rows.filter((r) => r.playthroughComplete).length
  const expiringSoon = rows.filter(
    (r) => r.expiresAt && r.expiresAt.getTime() - Date.now() < 86_400_000 * 3,
  ).length
  const avgProgress =
    rows.length > 0
      ? rows.reduce((s, r) => {
          const pct =
            r.playthroughRequired === 0n
              ? 100
              : Math.min(100, Number((r.playthroughProgress * 100n) / r.playthroughRequired))
          return s + pct
        }, 0) / rows.length
      : 0

  return (
    <ListPageShell
      title="Active bonuses"
      subtitle="Players currently in playthrough"
      description="The 200 most recently awarded bonuses still in active state. Use Playthrough for deeper per-player views."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Bonus' }, { label: 'Active' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Active awards', value: rows.length.toLocaleString(), tone: 'positive' },
        {
          label: 'Total SC bonded',
          value: `${formatCoins(totalSc.toString())} SC`,
          tone: 'neutral',
        },
        {
          label: 'Avg progress',
          value: `${Math.round(avgProgress)}%`,
          tone: avgProgress > 50 ? 'positive' : 'neutral',
        },
        {
          label: 'Playthrough complete',
          value: completed.toLocaleString(),
          delta: rows.length > 0 ? `${Math.round((completed / rows.length) * 100)}%` : undefined,
          tone: 'positive',
        },
        {
          label: 'Expiring < 3d',
          value: expiringSoon.toLocaleString(),
          tone: expiringSoon > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Sparkles />}
              title="No active bonuses"
              description="When bonuses are awarded they'll appear here until playthrough completes or they expire."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Bonus</th>
                  <th className="px-4 py-2 text-right">Award</th>
                  <th className="px-4 py-2">Playthrough</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Awarded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct =
                    r.playthroughRequired === 0n
                      ? 100
                      : Math.min(
                          100,
                          Number((r.playthroughProgress * 100n) / r.playthroughRequired),
                        )
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/players/${r.playerId}`}
                          className="text-ink-primary hover:underline"
                        >
                          {r.playerEmail}
                        </Link>
                        <div className="font-mono text-[10px] text-ink-tertiary">
                          {r.playerId.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink-primary">{r.bonusName}</div>
                        <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                          {r.bonusType}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {formatCoins(r.scAmount)} SC
                        {r.gcAmount > 0n && (
                          <div className="text-xs text-ink-tertiary">
                            + {formatCoins(r.gcAmount)} GC
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line-subtle">
                            <div
                              className={`h-full rounded-full ${
                                r.playthroughComplete ? 'bg-positive' : 'bg-accent'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-ink-secondary">{pct}%</span>
                          {r.playthroughComplete ? (
                            <StatusPill status="custom" color="positive" label="Complete" />
                          ) : null}
                        </div>
                        <div className="font-mono text-[10px] text-ink-tertiary">
                          {formatCoins(r.playthroughProgress)} /{' '}
                          {formatCoins(r.playthroughRequired)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {r.expiresAt ? r.expiresAt.toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {r.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
