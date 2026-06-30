import 'server-only'

import Link from 'next/link'
import { Package } from 'lucide-react'
import { asc, eq, isNull, sql } from 'drizzle-orm'

import { auth as coreAuth } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'
import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins, formatUsd } from '@/lib/format'

import { PackagesPanel } from './_panel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const session = await requireAdminSession('/admin/packages')
  const role = session.payload.role

  const db = getDb()
  const rawRows = await db
    .select()
    .from(schema.packages)
    .where(isNull(schema.packages.deletedAt))
    .orderBy(asc(schema.packages.sortOrder), asc(schema.packages.priceUsd))

  // Lifetime sales by package, for the table + insight tiles.
  const sales = await db
    .select({
      packageId: schema.purchases.packageId,
      sales: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${schema.purchases.amountUsd}), 0)::text`,
    })
    .from(schema.purchases)
    .where(eq(schema.purchases.status, 'completed'))
    .groupBy(schema.purchases.packageId)
  const salesByPkg = new Map(sales.map((s) => [s.packageId, s]))

  const active = rawRows.filter((r) => r.status === 'active').length
  const featured = rawRows.filter((r) => r.featuredSlot !== null).length
  const welcome = rawRows.filter((r) => r.firstPurchaseOnly).length
  let topSeller: { name: string; revenue: bigint } | null = null
  for (const r of rawRows) {
    const s = salesByPkg.get(r.id)
    const rev = s ? BigInt(Math.trunc(parseFloat(s.revenue))) : 0n
    if (!topSeller || rev > topSeller.revenue) {
      topSeller = { name: r.displayName, revenue: rev }
    }
  }
  const totalLifetimeSales = sales.reduce((s, r) => s + (r.sales ?? 0), 0)

  // Serialise once for the client — pre-format strings (formatCoins,
  // formatUsd) here so the client never needs to ship bigint helpers.
  const rows = rawRows.map((r) => {
    const s = salesByPkg.get(r.id)
    return {
      id: r.id,
      slug: r.slug,
      displayName: r.displayName,
      priceLabel: formatUsd(r.priceUsd.toString()),
      gcLabel: formatCoins(r.baseGc.toString()),
      gcBonusLabel: r.bonusGc > 0n ? `+ ${formatCoins(r.bonusGc.toString())}` : null,
      scLabel: formatCoins(r.baseSc.toString()),
      scBonusLabel: r.bonusSc > 0n ? `+ ${formatCoins(r.bonusSc.toString())}` : null,
      revenueLabel: formatUsd(s ? s.revenue : '0'),
      promotionalLabel: r.promotionalLabel,
      badgeColor: r.badgeColor,
      sortOrder: r.sortOrder,
      status: r.status,
      firstPurchaseOnly: r.firstPurchaseOnly,
      featuredSlot: r.featuredSlot,
      bannerHeadline: r.bannerHeadline,
      lifetimeSales: s?.sales ?? 0,
    }
  })

  const canEdit = coreAuth.hasAtLeast(role, 'manager')

  return (
    <ListPageShell
      title="Packages"
      subtitle={`${rows.length.toLocaleString()} loaded`}
      description="Coin packages a player can buy. Welcome packages show only to brand-new players, featured slots render as banners on top of the shop."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Packages' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        canEdit ? (
          <Button asChild>
            <Link href="/admin/packages/new">+ New package</Link>
          </Button>
        ) : (
          <Button disabled>+ New package</Button>
        )
      }
      insights={[
        { label: 'Total packages', value: rows.length.toLocaleString(), tone: 'neutral' },
        {
          label: 'Active',
          value: active.toLocaleString(),
          delta: rows.length > 0 ? `${Math.round((active / rows.length) * 100)}%` : undefined,
          tone: 'positive',
        },
        {
          label: 'Welcome (1st-purchase)',
          value: welcome.toLocaleString(),
          tone: welcome > 0 ? 'notice' : 'neutral',
        },
        {
          label: 'Featured slots',
          value: `${featured}/2`,
          tone: featured > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Top seller',
          value: topSeller ? topSeller.name : '—',
          delta:
            topSeller && topSeller.revenue > 0n
              ? formatUsd(topSeller.revenue.toString())
              : undefined,
          tone: 'positive',
        },
        {
          label: 'Lifetime sales',
          value: totalLifetimeSales.toLocaleString(),
          tone: 'neutral',
        },
      ]}
    >
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Package />}
              title="No packages configured"
              description="Add a package to expose it to players in the cashier."
              action={
                canEdit ? (
                  <Button asChild>
                    <Link href="/admin/packages/new">Create package</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PackagesPanel rows={rows} canEdit={canEdit} />
      )}
    </ListPageShell>
  )
}
