import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { formatUsdCompact } from '../_shared.client'
import { requireReportsAccess } from '../_shared.server'
import { ReportExportBar } from '../_filters'
import { PurchaseReportTable, type PurchaseReportRow } from './client-table'

export const dynamic = 'force-dynamic'

export default async function PurchaseReportPage() {
  await requireReportsAccess('/admin/reports/purchase')

  const db = getDb()

  const rows = await db
    .select({
      playerId: schema.playerLifetimeStats.playerId,
      email: schema.players.email,
      username: schema.players.username,
      state: schema.players.state,
      kycLevel: schema.players.kycLevel,
      totalDepositedUsd: schema.playerLifetimeStats.totalDepositedUsd,
      totalRedeemedUsd: schema.playerLifetimeStats.totalRedeemedUsd,
      netPositionUsd: schema.playerLifetimeStats.netPositionUsd,
      totalWageredSc: schema.playerLifetimeStats.totalWageredSc,
      totalWonSc: schema.playerLifetimeStats.totalWonSc,
      ngrSc: schema.playerLifetimeStats.ngrSc,
      purchaseCount: schema.playerLifetimeStats.purchaseCount,
      redemptionCount: schema.playerLifetimeStats.redemptionCount,
      sessionCount: schema.playerLifetimeStats.sessionCount,
      firstPurchaseAt: schema.playerLifetimeStats.firstPurchaseAt,
      lastPurchaseAt: schema.playerLifetimeStats.lastPurchaseAt,
      computedAt: schema.playerLifetimeStats.computedAt,
    })
    .from(schema.playerLifetimeStats)
    .innerJoin(schema.players, eq(schema.playerLifetimeStats.playerId, schema.players.id))
    .orderBy(desc(schema.playerLifetimeStats.totalDepositedUsd))
    .limit(5_000)

  // Single aggregate query — keeps the page snappy even with a long lifetime
  // stats table. We always show platform totals (not just the loaded top-5k).
  const [agg] = await db
    .select({
      players: sql<string>`COUNT(*)::text`,
      buyers: sql<string>`COUNT(*) FILTER (WHERE ${schema.playerLifetimeStats.purchaseCount} > 0)::text`,
      totalDeposited: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::bigint::text`,
      totalRedeemed: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalRedeemedUsd}), 0)::bigint::text`,
    })
    .from(schema.playerLifetimeStats)

  const totalPlayers = Number(agg?.players ?? '0')
  const totalBuyers = Number(agg?.buyers ?? '0')
  const totalDeposited = BigInt(agg?.totalDeposited ?? '0')
  const totalRedeemed = BigInt(agg?.totalRedeemed ?? '0')
  const avgPerBuyer = totalBuyers > 0 ? totalDeposited / BigInt(totalBuyers) : 0n

  const data: PurchaseReportRow[] = rows.map((r) => ({
    playerId: r.playerId,
    email: r.email,
    username: r.username,
    state: r.state,
    kycLevel: r.kycLevel,
    totalDepositedUsd: r.totalDepositedUsd.toString(),
    totalRedeemedUsd: r.totalRedeemedUsd.toString(),
    netPositionUsd: r.netPositionUsd.toString(),
    totalWageredSc: r.totalWageredSc.toString(),
    totalWonSc: r.totalWonSc.toString(),
    ngrSc: r.ngrSc.toString(),
    purchaseCount: r.purchaseCount,
    redemptionCount: r.redemptionCount,
    sessionCount: r.sessionCount,
    firstPurchaseAt: r.firstPurchaseAt?.toISOString() ?? null,
    lastPurchaseAt: r.lastPurchaseAt?.toISOString() ?? null,
    computedAt: r.computedAt.toISOString(),
  }))

  return (
    <ListPageShell
      title="Purchase Report"
      subtitle={`Top ${data.length.toLocaleString()} loaded · ${totalPlayers.toLocaleString()} total players`}
      description="Per-player lifetime stats — top buyers by USD deposited."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Purchase Report' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Lifetime deposited',
          value: formatUsdCompact(totalDeposited),
          tone: 'positive',
        },
        {
          label: 'Lifetime redeemed',
          value: formatUsdCompact(totalRedeemed),
          tone: 'neutral',
        },
        {
          label: 'Net hold',
          value: formatUsdCompact(totalDeposited - totalRedeemed),
          tone: totalDeposited > totalRedeemed ? 'positive' : 'critical',
        },
        {
          label: 'Avg per buyer',
          value: formatUsdCompact(avgPerBuyer),
          delta: `${totalBuyers.toLocaleString()} buyers`,
          tone: 'neutral',
        },
        {
          label: 'Buyer rate',
          value: totalPlayers > 0 ? `${((totalBuyers / totalPlayers) * 100).toFixed(1)}%` : '—',
          delta: `${totalPlayers.toLocaleString()} signups lifetime`,
          tone: 'neutral',
        },
      ]}
    >
      <ReportExportBar exportHref="/api/admin/reports/purchase/export" />
      <PurchaseReportTable rows={data} />
    </ListPageShell>
  )
}
