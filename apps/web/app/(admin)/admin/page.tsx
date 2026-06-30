import { Suspense } from 'react'

import {
  parseDashboardRange,
  resolveDashboardRange,
  type DashboardRange,
  type DashboardRangeBundle,
} from '@coinfrenzy/config'
import { isHost } from '@coinfrenzy/core/auth'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'
import { DashboardClient } from './dashboard-client'
import {
  fetchBonusBreakdown,
  fetchIntegrationHealth,
  fetchMonetizationBreakdown,
  fetchRecentSnapshots,
  fetchSliceForRange,
  fetchSparklineSnapshots,
  type RangeSlice,
  type TodaySlice,
} from './dashboard-data'
import { HostDashboard } from './_host-dashboard'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const session = await requireAdminSession()
  if (isHost(session.payload.role)) {
    return <HostDashboard hostId={session.admin.id} displayName={session.admin.displayName} />
  }
  const params = await searchParams
  const range = parseDashboardRange(flattenSearchParams(params))
  const bundle = resolveDashboardRange(range)

  const [slice, sparklineSnapshots, snapshots, bonusBreakdown, integrationHealth, monetization] =
    await Promise.all([
      fetchSliceForRange({ current: bundle.current, previous: bundle.previous }).catch(() => null),
      fetchSparklineSnapshots(bundle.sparkline).catch(() => []),
      fetchRecentSnapshots(30).catch(() => []),
      fetchBonusBreakdown().catch(() => []),
      fetchIntegrationHealth().catch(() => []),
      fetchMonetizationBreakdown().catch(() => null),
    ])

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title="Dashboard"
        subtitle="Master operations overview"
        description={`Showing ${bundle.current.label.toLowerCase()}. Online players still reflects a fixed 15-minute window.`}
      />
      <Suspense fallback={null}>
        <DashboardClient
          range={range}
          rangeBundle={serializeBundle(bundle)}
          initialToday={serializeToday(slice)}
          initialPrevious={slice ? serializeToday(slice.previous) : serializeToday(null)}
          initialSparkline={sparklineSnapshots.map(serializeSnapshot)}
          initialSnapshots={snapshots.map(serializeSnapshot)}
          initialBonusBreakdown={bonusBreakdown.map(serializeBonusRow)}
          integrationHealth={integrationHealth}
          monetization={serializeMonetization(monetization)}
        />
      </Suspense>
    </div>
  )
}

function flattenSearchParams(params: Record<string, string | string[] | undefined>): {
  range?: string | null
  from?: string | null
  to?: string | null
} {
  return {
    range: typeof params.range === 'string' ? params.range : null,
    from: typeof params.from === 'string' ? params.from : null,
    to: typeof params.to === 'string' ? params.to : null,
  }
}

function serializeToday(t: TodaySlice | RangeSlice | null) {
  if (!t) {
    return {
      scStakedToday: '0',
      scWonToday: '0',
      ggrToday: '0',
      ngrToday: '0',
      scAwardedToday: '0',
      depositsToday: '0',
      pendingRedemptionsCount: 0,
      pendingRedemptionsUsd: '0',
      completedRedemptionsCount: 0,
      completedRedemptionsUsd: '0',
      netCashToday: '0',
      holdBpsToday: -1,
      purchaseCountToday: 0,
      purchasingPlayersToday: 0,
      signupsToday: 0,
      netScPosition: '0',
      onlinePlayers: 0,
      dauToday: 0,
      firstPurchasersToday: 0,
      weeklyActive: 0,
      uniqueLoginsToday: 0,
      totalPlayersAllTime: 0,
      totalPurchasersAllTime: 0,
    }
  }
  return {
    scStakedToday: t.scStakedToday.toString(),
    scWonToday: t.scWonToday.toString(),
    ggrToday: t.ggrToday.toString(),
    ngrToday: t.ngrToday.toString(),
    scAwardedToday: t.scAwardedToday.toString(),
    depositsToday: t.depositsToday.toString(),
    pendingRedemptionsCount: t.pendingRedemptions.count,
    pendingRedemptionsUsd: t.pendingRedemptions.usd.toString(),
    completedRedemptionsCount: t.completedRedemptions.count,
    completedRedemptionsUsd: t.completedRedemptions.usd.toString(),
    netCashToday: t.netCashToday.toString(),
    holdBpsToday: t.holdBpsToday,
    purchaseCountToday: t.purchaseCountToday,
    purchasingPlayersToday: t.purchasingPlayersToday,
    signupsToday: t.signupsToday,
    netScPosition: t.netScPosition.toString(),
    onlinePlayers: t.onlinePlayers,
    dauToday: t.dauToday,
    firstPurchasersToday: t.firstPurchasersToday,
    weeklyActive: t.weeklyActive,
    uniqueLoginsToday: t.uniqueLoginsToday,
    totalPlayersAllTime: t.totalPlayersAllTime,
    totalPurchasersAllTime: t.totalPurchasersAllTime,
  }
}

function serializeBundle(b: DashboardRangeBundle) {
  return {
    current: {
      from: b.current.from.toISOString(),
      to: b.current.to.toISOString(),
      days: b.current.days,
      label: b.current.label,
    },
    previous: {
      from: b.previous.from.toISOString(),
      to: b.previous.to.toISOString(),
      days: b.previous.days,
      label: b.previous.label,
    },
    sparkline: {
      from: b.sparkline.from.toISOString(),
      to: b.sparkline.to.toISOString(),
      days: b.sparkline.days,
      label: b.sparkline.label,
    },
  }
}

function serializeSnapshot(s: {
  date: string
  dau: number
  uniqueLogins: number
  newRegistered: number
  scStaked: bigint
  ggr: bigint
  ngr: bigint
  bonusTotal: bigint
  depositsUsd: bigint
}) {
  return {
    date: s.date,
    dau: s.dau,
    uniqueLogins: s.uniqueLogins,
    newRegistered: s.newRegistered,
    scStaked: s.scStaked.toString(),
    ggr: s.ggr.toString(),
    ngr: s.ngr.toString(),
    bonusTotal: s.bonusTotal.toString(),
    depositsUsd: s.depositsUsd.toString(),
  }
}

function serializeBonusRow(b: {
  bonusType: string
  todaySc: bigint
  yesterdaySc: bigint
  mtdSc: bigint
}) {
  return {
    bonusType: b.bonusType,
    todaySc: b.todaySc.toString(),
    yesterdaySc: b.yesterdaySc.toString(),
    mtdSc: b.mtdSc.toString(),
  }
}

function serializeMonetization(m: Awaited<ReturnType<typeof fetchMonetizationBreakdown>> | null) {
  // The shape is already JSON-friendly (numbers + minor-unit strings) but we
  // pass through `null` as an empty breakdown so the client never has to
  // branch. Using the empty helper keeps the wire shape stable.
  if (!m) {
    return {
      totalPlayers: 0,
      payingPlayers: 0,
      spendersByTier: { '100': 0, '500': 0, '1000': 0, '2500': 0, '5000': 0, '10000': 0 },
      lifetimeDepositsUsd: '0',
      lifetimeWithdrawalsUsd: '0',
      lifetimeWageredSc: '0',
      lifetimeWonSc: '0',
      avgDepositPerPayerUsd: '0',
      netHouseHoldUsd: '0',
      conversionBps: -1,
      withdrawalsPctBps: -1,
      holdRateBps: -1,
      betMultiplierBps: -1,
      winPctBps: -1,
    }
  }
  return {
    totalPlayers: m.totalPlayers,
    payingPlayers: m.payingPlayers,
    spendersByTier: {
      '100': m.spendersByTier[100],
      '500': m.spendersByTier[500],
      '1000': m.spendersByTier[1000],
      '2500': m.spendersByTier[2500],
      '5000': m.spendersByTier[5000],
      '10000': m.spendersByTier[10000],
    },
    lifetimeDepositsUsd: m.lifetimeDepositsUsd,
    lifetimeWithdrawalsUsd: m.lifetimeWithdrawalsUsd,
    lifetimeWageredSc: m.lifetimeWageredSc,
    lifetimeWonSc: m.lifetimeWonSc,
    avgDepositPerPayerUsd: m.avgDepositPerPayerUsd,
    netHouseHoldUsd: m.netHouseHoldUsd,
    conversionBps: m.conversionBps,
    withdrawalsPctBps: m.withdrawalsPctBps,
    holdRateBps: m.holdRateBps,
    betMultiplierBps: m.betMultiplierBps,
    winPctBps: m.winPctBps,
  }
}

export type { DashboardRange }
