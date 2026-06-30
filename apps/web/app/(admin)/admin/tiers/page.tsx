import 'server-only'

import Link from 'next/link'
import { Crown } from 'lucide-react'
import { asc, sql } from 'drizzle-orm'

import { auth as coreAuth } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'
import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { TiersPanel } from './_panel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const session = await requireAdminSession('/admin/tiers')
  const role = session.payload.role
  const db = getDb()

  const rawTiers = await db.select().from(schema.tiers).orderBy(asc(schema.tiers.level))

  // Players per tier — drives the "what would this cost me weekly?" tile.
  const playerCounts = await db
    .select({
      tierId: schema.tierProgress.currentTierId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.tierProgress)
    .groupBy(schema.tierProgress.currentTierId)
  const countsByTier = new Map(playerCounts.map((p) => [p.tierId, p.n]))

  const totalPlayers = playerCounts.reduce((s, p) => s + p.n, 0)
  const active = rawTiers.filter((t) => t.status === 'active').length
  const top = rawTiers
    .slice()
    .sort((a, b) => (countsByTier.get(b.id) ?? 0) - (countsByTier.get(a.id) ?? 0))[0]

  // Estimated weekly + monthly payout if every player claimed their tier
  // reward this period. This is the "ceiling we'd give away" number.
  const totalWeeklyBonusPool = rawTiers.reduce(
    (s, t) => s + t.weeklyScBonus * BigInt(countsByTier.get(t.id) ?? 0),
    0n,
  )
  const totalMonthlyBonusPool = rawTiers.reduce(
    (s, t) => s + t.monthlyScBonus * BigInt(countsByTier.get(t.id) ?? 0),
    0n,
  )

  const canEdit = coreAuth.hasAtLeast(role, 'manager')

  // Serialise + pre-format for the client panel.
  const rows = rawTiers.map((t) => ({
    id: t.id,
    slug: t.slug,
    displayName: t.displayName,
    level: t.level,
    xpRequired: t.xpRequired.toString(),
    weeklyScBonus: t.weeklyScBonus.toString(),
    monthlyScBonus: t.monthlyScBonus.toString(),
    dailyLoginBonusMult: t.dailyLoginBonusMult,
    cashbackPct: t.cashbackPct,
    badgeColor: t.badgeColor,
    description: t.description,
    status: t.status,
    xpRequiredLabel: formatCoins(t.xpRequired.toString()),
    weeklyScLabel: formatCoins(t.weeklyScBonus.toString()),
    monthlyScLabel: formatCoins(t.monthlyScBonus.toString()),
    loginMultLabel: `${Number(t.dailyLoginBonusMult).toFixed(2)}×`,
    cashbackLabel: `${(Number(t.cashbackPct ?? 0) * 100).toFixed(2)}%`,
    playerCount: countsByTier.get(t.id) ?? 0,
    weeklyPayoutEstimate: (t.weeklyScBonus * BigInt(countsByTier.get(t.id) ?? 0)).toString(),
    weeklyPayoutLabel: formatCoins(
      (t.weeklyScBonus * BigInt(countsByTier.get(t.id) ?? 0)).toString(),
    ),
  }))

  return (
    <ListPageShell
      title="Loyalty tiers"
      subtitle={`${rows.length.toLocaleString()} configured`}
      description="Player loyalty tiers determine weekly bonuses, login multipliers, cashback, and access to higher-value features. Hard safety caps are enforced: max 5,000 SC weekly · max 25,000 SC monthly · max 3× login mult · max 25% cashback."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Tiers' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        canEdit ? (
          <Button asChild>
            <Link href="/admin/tiers/new">+ New tier</Link>
          </Button>
        ) : (
          <Button disabled>+ New tier</Button>
        )
      }
      insights={[
        { label: 'Total tiers', value: rows.length.toLocaleString(), tone: 'neutral' },
        { label: 'Active', value: active.toLocaleString(), tone: 'positive' },
        {
          label: 'Players in tiers',
          value: totalPlayers.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Top tier',
          value: top ? top.displayName : '—',
          delta: top ? `${(countsByTier.get(top.id) ?? 0).toLocaleString()} players` : undefined,
          tone: 'positive',
        },
        {
          label: 'Weekly bonus pool',
          value: `${formatCoins(totalWeeklyBonusPool.toString())} SC`,
          delta: totalPlayers > 0 ? 'if all claim' : undefined,
          tone: totalWeeklyBonusPool > 100_000n * 10_000n ? 'notice' : 'neutral',
        },
        {
          label: 'Monthly bonus pool',
          value: `${formatCoins(totalMonthlyBonusPool.toString())} SC`,
          delta: totalPlayers > 0 ? 'if all claim' : undefined,
          tone: totalMonthlyBonusPool > 500_000n * 10_000n ? 'notice' : 'neutral',
        },
      ]}
    >
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Crown />}
              title="No tiers configured"
              description="Define tiers to enable loyalty benefits and weekly bonuses."
              action={
                canEdit ? (
                  <Button asChild>
                    <Link href="/admin/tiers/new">Create tier</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <TiersPanel rows={rows} canEdit={canEdit} />
      )}
    </ListPageShell>
  )
}
