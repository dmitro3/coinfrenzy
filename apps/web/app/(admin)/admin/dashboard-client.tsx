'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Coins,
  CreditCard,
  Crown,
  DollarSign,
  Gem,
  Gift,
  Minus,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { rangeTileSuffix, rangeToSearchParams, type DashboardRange } from '@coinfrenzy/config'
import { StatCard, StatCardWithTrend } from '@coinfrenzy/ui/admin/cards'
import {
  IntegrationHealthTile,
  type IntegrationHealthState,
} from '@coinfrenzy/ui/admin/display/IntegrationHealthTile'
import { TimeRangeSelector } from '@coinfrenzy/ui/admin/data/TimeRangeSelector'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { useRealtime } from './_realtime'

interface TodayJson {
  scStakedToday: string
  scWonToday: string
  ggrToday: string
  ngrToday: string
  scAwardedToday: string
  depositsToday: string
  pendingRedemptionsCount: number
  pendingRedemptionsUsd: string
  completedRedemptionsCount: number
  completedRedemptionsUsd: string
  netCashToday: string
  /** Hold % expressed in basis points (10000 = 100%). -1 = N/A. */
  holdBpsToday: number
  purchaseCountToday: number
  purchasingPlayersToday: number
  signupsToday: number
  netScPosition: string
  onlinePlayers: number
  dauToday: number
  firstPurchasersToday: number
  weeklyActive: number
  uniqueLoginsToday: number
  totalPlayersAllTime: number
  totalPurchasersAllTime: number
}

interface SnapshotJson {
  date: string
  dau: number
  uniqueLogins: number
  newRegistered: number
  scStaked: string
  ggr: string
  ngr: string
  bonusTotal: string
  depositsUsd: string
}

interface BonusRowJson {
  bonusType: string
  todaySc: string
  yesterdaySc: string
  mtdSc: string
}

interface MonetizationJson {
  totalPlayers: number
  payingPlayers: number
  spendersByTier: {
    '100': number
    '500': number
    '1000': number
    '2500': number
    '5000': number
    '10000': number
  }
  lifetimeDepositsUsd: string
  lifetimeWithdrawalsUsd: string
  lifetimeWageredSc: string
  lifetimeWonSc: string
  avgDepositPerPayerUsd: string
  netHouseHoldUsd: string
  conversionBps: number
  withdrawalsPctBps: number
  holdRateBps: number
  betMultiplierBps: number
  winPctBps: number
}

interface IntegrationHealthJson {
  name: string
  state: IntegrationHealthState
  lastSeenAt: string | null
  errorCount1h: number
}

interface RangeBoundsJson {
  from: string
  to: string
  days: number
  label: string
}

interface RangeBundleJson {
  current: RangeBoundsJson
  previous: RangeBoundsJson
  sparkline: RangeBoundsJson
}

interface DashboardClientProps {
  range: DashboardRange
  rangeBundle: RangeBundleJson
  initialToday: TodayJson
  initialPrevious: TodayJson
  initialSparkline: SnapshotJson[]
  initialSnapshots: SnapshotJson[]
  initialBonusBreakdown: BonusRowJson[]
  integrationHealth: IntegrationHealthJson[]
  monetization: MonetizationJson
}

export function DashboardClient({
  range,
  rangeBundle,
  initialToday,
  initialPrevious,
  initialSparkline,
  initialSnapshots,
  initialBonusBreakdown,
  integrationHealth,
  monetization,
}: DashboardClientProps) {
  const realtime = useRealtime()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Realtime counters override the SSR-rendered values, but only when the
  // selected range is "today" — the realtime channel emits a fixed today
  // window, so applying it to a different selected range would corrupt it.
  const useRealtimeCounters = realtime.counters && range.kind === 'today'
  const today: TodayJson = useRealtimeCounters
    ? {
        scStakedToday: realtime.counters!.scStakedToday,
        scWonToday: realtime.counters!.scWonToday,
        ggrToday: realtime.counters!.ggrToday,
        ngrToday: realtime.counters!.ngrToday,
        scAwardedToday: realtime.counters!.scAwardedToday,
        depositsToday: realtime.counters!.depositsToday,
        pendingRedemptionsCount: realtime.counters!.pendingRedemptionsCount,
        pendingRedemptionsUsd: realtime.counters!.pendingRedemptionsUsd,
        completedRedemptionsCount: realtime.counters!.completedRedemptionsCount,
        completedRedemptionsUsd: realtime.counters!.completedRedemptionsUsd,
        netCashToday: realtime.counters!.netCashToday,
        holdBpsToday: realtime.counters!.holdBpsToday,
        purchaseCountToday: realtime.counters!.purchaseCountToday,
        purchasingPlayersToday: realtime.counters!.purchasingPlayersToday,
        signupsToday: realtime.counters!.signupsToday,
        netScPosition: realtime.counters!.netScPosition,
        onlinePlayers: realtime.counters!.onlinePlayers,
        dauToday: realtime.counters!.dauToday,
        firstPurchasersToday: realtime.counters!.firstPurchasersToday,
        weeklyActive: realtime.counters!.weeklyActive,
        uniqueLoginsToday: realtime.counters!.uniqueLoginsToday,
        totalPlayersAllTime: realtime.counters!.totalPlayersAllTime,
        totalPurchasersAllTime: realtime.counters!.totalPurchasersAllTime,
      }
    : initialToday

  const handleRangeChange = React.useCallback(
    (next: DashboardRange) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      // Wipe any existing range params before applying the new ones.
      params.delete('range')
      params.delete('from')
      params.delete('to')
      const entries = rangeToSearchParams(next)
      for (const [k, v] of Object.entries(entries)) {
        params.set(k, v)
      }
      const qs = params.toString()
      router.push(qs ? `/admin?${qs}` : '/admin')
    },
    [router, searchParams],
  )

  const sparkline = [...initialSparkline].reverse()
  const rangeSuffix = rangeTileSuffix(rangeBundleToBundle(rangeBundle))
  const sublabelVsPrevious = `vs ${rangeBundle.previous.label}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-secondary">
          Showing{' '}
          <span className="text-ink-primary">{rangeBundle.current.label.toLowerCase()}</span>
          {' · '}
          {rangeBundle.current.days === 1 ? '1 day' : `${rangeBundle.current.days} days`} window
        </div>
        <TimeRangeSelector value={range} onChange={handleRangeChange} />
      </div>

      <div className="space-y-8">
        {/* Hero — the two numbers ops looks at first. GGR (with Hold %, Bet,
            Win) on the left; Net Cash (with Purchases, Redemptions) on the
            right. Side-by-side on wide screens, stacked on narrow. */}
        <section aria-labelledby="row-hero">
          <h2 id="row-hero" className="sr-only">
            {rangeBundle.current.label} headline
          </h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <GgrHeroCard
              rangeLabel={rangeBundle.current.label}
              ggr={today.ggrToday}
              prevGgr={initialPrevious.ggrToday}
              bet={today.scStakedToday}
              win={today.scWonToday}
              prevBet={initialPrevious.scStakedToday}
              holdBps={today.holdBpsToday}
              prevHoldBps={initialPrevious.holdBpsToday}
            />
            <NetCashHeroCard
              rangeLabel={rangeBundle.current.label}
              netCash={today.netCashToday}
              prevNetCash={initialPrevious.netCashToday}
              purchasesUsd={today.depositsToday}
              prevPurchasesUsd={initialPrevious.depositsToday}
              purchaseCount={today.purchaseCountToday}
              prevPurchaseCount={initialPrevious.purchaseCountToday}
              purchasingPlayers={today.purchasingPlayersToday}
              redemptionsUsd={today.completedRedemptionsUsd}
              prevRedemptionsUsd={initialPrevious.completedRedemptionsUsd}
              redemptionsCount={today.completedRedemptionsCount}
              prevRedemptionsCount={initialPrevious.completedRedemptionsCount}
              pendingCount={today.pendingRedemptionsCount}
              pendingUsd={today.pendingRedemptionsUsd}
            />
          </div>
        </section>

        {/* At-a-glance — the next-most-important set of headline numbers
            (Total Players, Total Purchasers, Online, Pending Redemptions). */}
        <section aria-labelledby="row-glance">
          <h2 id="row-glance" className="sr-only">
            At a glance
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total Players"
              value={today.totalPlayersAllTime.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
              sublabel="all-time registered"
            />
            <StatCard
              label="Total Purchasers"
              value={today.totalPurchasersAllTime.toLocaleString()}
              icon={<ShoppingCart className="h-4 w-4" />}
              sublabel={`${today.totalPlayersAllTime > 0 ? Math.round((today.totalPurchasersAllTime / today.totalPlayersAllTime) * 100) : 0}% conversion`}
            />
            <StatCard
              label="Online Players"
              value={today.onlinePlayers.toLocaleString()}
              icon={<Activity className="h-4 w-4" />}
              sublabel={realtime.state === 'connected' ? 'live · 15-min window' : '15-min window'}
            />
            <StatCard
              label="Pending Redemptions"
              value={today.pendingRedemptionsCount.toLocaleString()}
              sublabel={`$${formatUsd(today.pendingRedemptionsUsd)}`}
              icon={<AlertCircle className="h-4 w-4" />}
            />
          </div>
        </section>

        {/* Monetization — "who actually pays". All-time / cumulative
            (range-independent on purpose: a $1,000 player is a $1,000
            player regardless of which window is selected). Mirrors the
            Frenzy Creator widget pattern. */}
        <MonetizationSection data={monetization} />

        {/* Coin economy — the SC ledger numbers ops uses to reconcile (NGR,
            SC Awarded, cumulative Net SC Position). De-emphasized vs. the
            hero so the operator's eye lands on cash first. */}
        <section aria-labelledby="row-coin-economy">
          <h2 id="row-coin-economy" className="sr-only">
            Coin economy
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={`${rangeBundle.current.label} NGR`}
              value={formatSc(today.ngrToday)}
              unit="SC"
              icon={<TrendingUp className="h-4 w-4" />}
              deltaPct={pctDelta(today.ngrToday, initialPrevious.ngrToday)}
              sublabel={sublabelVsPrevious}
            />
            <StatCard
              label={`${rangeBundle.current.label} SC Awarded`}
              value={formatSc(today.scAwardedToday)}
              unit="SC"
              icon={<Gift className="h-4 w-4" />}
              deltaPct={pctDelta(today.scAwardedToday, initialPrevious.scAwardedToday)}
              sublabel={sublabelVsPrevious}
            />
            <StatCard
              label="Net SC Position"
              value={formatSc(today.netScPosition)}
              unit="SC"
              icon={<Wallet className="h-4 w-4" />}
              sublabel="cumulative (all wallets)"
            />
          </div>
        </section>

        {/* Second row — engagement (5 tiles). */}
        <section aria-labelledby="row-engagement">
          <h2 id="row-engagement" className="sr-only">
            Engagement
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label={`${rangeBundle.current.label} DAU`}
              value={today.dauToday.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
              deltaPct={pctDeltaInt(today.dauToday, initialPrevious.dauToday)}
              sublabel={sublabelVsPrevious}
            />
            <StatCard
              label={`${rangeBundle.current.label} Signups`}
              value={today.signupsToday.toLocaleString()}
              icon={<UserPlus className="h-4 w-4" />}
              deltaPct={pctDeltaInt(today.signupsToday, initialPrevious.signupsToday)}
              sublabel={sublabelVsPrevious}
            />
            <StatCard
              label="First Purchasers"
              value={today.firstPurchasersToday.toLocaleString()}
              icon={<CreditCard className="h-4 w-4" />}
              deltaPct={pctDeltaInt(
                today.firstPurchasersToday,
                initialPrevious.firstPurchasersToday,
              )}
              sublabel={sublabelVsPrevious}
            />
            <StatCard
              label="7-Day Active"
              value={today.weeklyActive.toLocaleString()}
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
              label="Unique Logins"
              value={today.uniqueLoginsToday.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
              deltaPct={pctDeltaInt(today.uniqueLoginsToday, initialPrevious.uniqueLoginsToday)}
              sublabel={sublabelVsPrevious}
            />
          </div>
        </section>

        {/* Third row — operational mini-chart cards. Always 7 days, anchored
            to the END of the selected range (so a "Last 30 days" range still
            shows a 7-day trailing trend). */}
        <section aria-labelledby="row-ops">
          <h2 id="row-ops" className="sr-only">
            Operational
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCardWithTrend
              label={`${rangeSuffix} GGR`}
              value={formatSc(sumBig(sparkline, 'ggr'))}
              unit="SC"
              series={sparkline.map((s) => ({ x: s.date, y: moneyToNumber(s.ggr) }))}
            />
            <StatCardWithTrend
              label={`${rangeSuffix} SC Staked`}
              value={formatSc(sumBig(sparkline, 'scStaked'))}
              unit="SC"
              series={sparkline.map((s) => ({ x: s.date, y: moneyToNumber(s.scStaked) }))}
            />
            <StatCardWithTrend
              label={`${rangeSuffix} Net Purchases`}
              value={`$${formatUsd(sumBig(sparkline, 'depositsUsd'))}`}
              series={sparkline.map((s) => ({ x: s.date, y: moneyToNumber(s.depositsUsd) }))}
            />
            <StatCardWithTrend
              label={`${rangeSuffix} Bonus Awarded`}
              value={formatSc(sumBig(sparkline, 'bonusTotal'))}
              unit="SC"
              series={sparkline.map((s) => ({ x: s.date, y: moneyToNumber(s.bonusTotal) }))}
            />
          </div>
        </section>

        {/* Fourth row — drill-downs. */}
        <section aria-labelledby="row-drill" className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <BonusBreakdownCard rows={initialBonusBreakdown} />
          <LoginCustomerCard snapshots={initialSnapshots} />
        </section>

        {/* Fifth row — integration health. */}
        <section aria-labelledby="row-health">
          <Card>
            <CardHeader>
              <CardTitle id="row-health">Integration health</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {integrationHealth.map((h) => (
                <IntegrationHealthTile
                  key={h.name}
                  name={h.name}
                  state={h.state}
                  lastSeenAt={h.lastSeenAt}
                  errorCount1h={h.errorCount1h}
                />
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

function rangeBundleToBundle(b: RangeBundleJson): {
  current: { from: Date; to: Date; days: number; label: string }
  previous: { from: Date; to: Date; days: number; label: string }
  sparkline: { from: Date; to: Date; days: number; label: string }
} {
  return {
    current: {
      from: new Date(b.current.from),
      to: new Date(b.current.to),
      days: b.current.days,
      label: b.current.label,
    },
    previous: {
      from: new Date(b.previous.from),
      to: new Date(b.previous.to),
      days: b.previous.days,
      label: b.previous.label,
    },
    sparkline: {
      from: new Date(b.sparkline.from),
      to: new Date(b.sparkline.to),
      days: b.sparkline.days,
      label: b.sparkline.label,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Hero cards — GGR + Net Cash                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Hero card for the operator's headline gaming number: GGR ($) and Hold %.
 * Subordinate numbers are Total Bet and Total Win, sized smaller so the eye
 * lands on GGR first. All vs-previous deltas use the same range that drives
 * the dashboard.
 */
function GgrHeroCard({
  rangeLabel,
  ggr,
  prevGgr,
  bet,
  win,
  prevBet,
  holdBps,
  prevHoldBps,
}: {
  rangeLabel: string
  ggr: string
  prevGgr: string
  bet: string
  win: string
  prevBet: string
  holdBps: number
  prevHoldBps: number
}) {
  const ggrDelta = pctDelta(ggr, prevGgr)
  const betDelta = pctDelta(bet, prevBet)
  const holdDeltaBps = holdBps >= 0 && prevHoldBps >= 0 ? holdBps - prevHoldBps : null
  const ggrPositive = BigInt(ggr) >= 0n
  const ggrTone = ggrPositive ? 'text-positive' : 'text-critical'
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-baseline justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-ink-tertiary" />
          {rangeLabel} GGR
        </CardTitle>
        <span className="text-xs text-ink-tertiary">Bet − Win · the operator&apos;s hold</span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-4xl font-semibold tabular-nums tracking-tight ${ggrTone}`}>
              {formatSc(ggr)}
            </span>
            <span className="text-md font-medium text-ink-tertiary">SC</span>
          </div>
          <HoldBadge bps={holdBps} />
          {ggrDelta != null ? (
            <DeltaInline pct={ggrDelta} caption={`vs prev ${rangeLabel.toLowerCase()}`} />
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubMetric
            label="Total Bet"
            value={formatSc(bet)}
            unit="SC"
            icon={<Coins className="h-3.5 w-3.5" />}
            delta={betDelta}
          />
          <SubMetric
            label="Total Win"
            value={formatSc(win)}
            unit="SC"
            icon={<ArrowDownRight className="h-3.5 w-3.5" />}
            delta={null}
          />
        </div>
        {holdDeltaBps != null ? (
          <p className="text-xs text-ink-tertiary">
            Hold % {holdDeltaBps >= 0 ? 'up' : 'down'} {Math.abs(holdDeltaBps / 100).toFixed(2)} pp
            vs prev {rangeLabel.toLowerCase()}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Hero card for the operator's headline cashflow number: Net Cash (Purchases
 * minus Completed Redemptions) plus the two inputs that compose it. Tinted
 * green when positive (operator net up), red when negative.
 */
function NetCashHeroCard({
  rangeLabel,
  netCash,
  prevNetCash,
  purchasesUsd,
  prevPurchasesUsd,
  purchaseCount,
  prevPurchaseCount,
  purchasingPlayers,
  redemptionsUsd,
  prevRedemptionsUsd,
  redemptionsCount,
  prevRedemptionsCount,
  pendingCount,
  pendingUsd,
}: {
  rangeLabel: string
  netCash: string
  prevNetCash: string
  purchasesUsd: string
  prevPurchasesUsd: string
  purchaseCount: number
  prevPurchaseCount: number
  purchasingPlayers: number
  redemptionsUsd: string
  prevRedemptionsUsd: string
  redemptionsCount: number
  prevRedemptionsCount: number
  pendingCount: number
  pendingUsd: string
}) {
  const netDelta = pctDelta(netCash, prevNetCash)
  const purchaseUsdDelta = pctDelta(purchasesUsd, prevPurchasesUsd)
  const purchaseCountDelta = pctDeltaInt(purchaseCount, prevPurchaseCount)
  const redemptionUsdDelta = pctDelta(redemptionsUsd, prevRedemptionsUsd)
  const redemptionCountDelta = pctDeltaInt(redemptionsCount, prevRedemptionsCount)
  const positive = BigInt(netCash) >= 0n
  const netTone = positive ? 'text-positive' : 'text-critical'
  const sign = positive ? '+' : '−'
  const absNet = positive ? BigInt(netCash) : -BigInt(netCash)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-baseline justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-ink-tertiary" />
          {rangeLabel} Net Cash
        </CardTitle>
        <span className="text-xs text-ink-tertiary">
          Purchases − Redemptions · operator&apos;s net cash flow
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-4xl font-semibold tabular-nums tracking-tight ${netTone}`}>
              {sign}${formatUsd(absNet.toString())}
            </span>
          </div>
          {netDelta != null ? (
            <DeltaInline pct={netDelta} caption={`vs prev ${rangeLabel.toLowerCase()}`} />
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubMetric
            label="Purchases"
            value={`$${formatUsd(purchasesUsd)}`}
            sublabel={`${purchaseCount.toLocaleString()} purchases · ${purchasingPlayers.toLocaleString()} purchasers`}
            icon={<CreditCard className="h-3.5 w-3.5" />}
            delta={purchaseUsdDelta}
            countDelta={purchaseCountDelta}
          />
          <SubMetric
            label="Redemptions"
            value={`$${formatUsd(redemptionsUsd)}`}
            sublabel={`${redemptionsCount.toLocaleString()} paid · ${pendingCount.toLocaleString()} pending ($${formatUsd(pendingUsd)})`}
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            delta={redemptionUsdDelta}
            countDelta={redemptionCountDelta}
            invertDeltaTone
          />
        </div>
      </CardContent>
    </Card>
  )
}

function HoldBadge({ bps }: { bps: number }) {
  if (bps < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-base px-2.5 py-1 text-xs text-ink-tertiary">
        <span className="font-medium uppercase tracking-wide">Hold</span>
        <span className="tabular-nums">—</span>
      </span>
    )
  }
  const positive = bps >= 0
  const cls = positive
    ? 'border-positive/30 bg-positive/10 text-positive'
    : 'border-critical/30 bg-critical/10 text-critical'
  const pct = (bps / 100).toFixed(2)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium ${cls}`}
    >
      <span className="text-[11px] uppercase tracking-wide opacity-80">Hold</span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  )
}

function SubMetric({
  label,
  value,
  unit,
  sublabel,
  icon,
  delta,
  countDelta,
  invertDeltaTone,
}: {
  label: string
  value: string
  unit?: string
  sublabel?: string
  icon?: React.ReactNode
  delta?: number | null
  countDelta?: number | null
  /** When true, "up" becomes critical-tone (more redemptions paid out). */
  invertDeltaTone?: boolean
}) {
  return (
    <div className="rounded-md border border-line-subtle bg-base p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          {icon}
          {label}
        </span>
        {delta != null ? <DeltaPill pct={delta} invertTone={invertDeltaTone} /> : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums text-ink-primary">{value}</span>
        {unit ? <span className="text-xs font-medium text-ink-tertiary">{unit}</span> : null}
      </div>
      {sublabel ? <div className="mt-1 truncate text-xs text-ink-tertiary">{sublabel}</div> : null}
      {countDelta != null && delta == null ? (
        <div className="mt-1">
          <DeltaPill pct={countDelta} invertTone={invertDeltaTone} />
        </div>
      ) : null}
    </div>
  )
}

function DeltaInline({ pct, caption }: { pct: number; caption?: string }) {
  const positive = pct >= 0
  const Icon = positive ? ArrowUp : ArrowDown
  const cls = positive ? 'text-positive' : 'text-critical'
  return (
    <span className="inline-flex items-baseline gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-medium ${cls}`}>
        <Icon className="h-3 w-3" />
        {(Math.abs(pct) * 100).toFixed(1)}%
      </span>
      {caption ? <span className="text-ink-tertiary">{caption}</span> : null}
    </span>
  )
}

function DeltaPill({ pct, invertTone }: { pct: number; invertTone?: boolean }) {
  if (!Number.isFinite(pct)) return null
  const isFlat = Math.abs(pct) < 0.0005
  const positive = pct >= 0
  const Icon = isFlat ? Minus : positive ? ArrowUp : ArrowDown
  // For redemptions and similar "up = bad" series, invertTone flips the
  // semantic colors so the eye still scans red = adverse.
  const goodDirection = invertTone ? !positive : positive
  const cls = isFlat ? 'text-ink-tertiary' : goodDirection ? 'text-positive' : 'text-critical'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {(Math.abs(pct) * 100).toFixed(1)}%
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Monetization — "who actually pays" (all-time cohort breakdown)              */
/* -------------------------------------------------------------------------- */

/**
 * The Frenzy-Creator-style spender breakdown: eight cohort tiles (total →
 * paying → spend tiers) on top, five lifetime aggregate tiles below
 * (deposits, withdrawals, net hold, wagered, won). All numbers are
 * cumulative across non-internal players — the section answers "what does
 * my paying base look like right now?" independently of the dashboard's
 * time-range selector.
 */
function MonetizationSection({ data }: { data: MonetizationJson }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2 pb-4">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-positive" />
          Monetization
          <span className="rounded-md bg-positive/10 px-2 py-0.5 text-[11px] font-medium text-positive">
            who actually pays
          </span>
        </CardTitle>
        <span className="text-xs text-ink-tertiary">
          all-time · cumulative across {data.totalPlayers.toLocaleString()} players
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cohort row — 8 tiles (Total / Paying / six spend tiers). */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <CohortTile
            tone="neutral"
            label="Total Players"
            value={data.totalPlayers}
            sub="in system"
            icon={<Users className="h-3.5 w-3.5" />}
          />
          <CohortTile
            tone="green"
            label="Paying Players"
            value={data.payingPlayers}
            sub={
              data.conversionBps >= 0
                ? `${(data.conversionBps / 100).toFixed(1)}% conversion`
                : 'no players yet'
            }
            icon={<DollarSign className="h-3.5 w-3.5" />}
            href="/admin/players?quick=high-value"
          />
          <CohortTile
            tone="gold"
            label="$100+ Spenders"
            value={data.spendersByTier['100']}
            sub="deposited $100 or more"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
          <CohortTile
            tone="gold"
            label="$500+ High Rollers"
            value={data.spendersByTier['500']}
            sub="deposited $500 or more"
            icon={<Trophy className="h-3.5 w-3.5" />}
          />
          <CohortTile
            tone="gold"
            label="$1,000+ VIPs"
            value={data.spendersByTier['1000']}
            sub="deposited $1,000 or more"
            icon={<Trophy className="h-3.5 w-3.5" />}
          />
          <CohortTile
            tone="gold"
            label="$2,500+ VIPs"
            value={data.spendersByTier['2500']}
            sub="deposited $2,500 or more"
            icon={<Crown className="h-3.5 w-3.5" />}
          />
          <CohortTile
            tone="gold"
            label="$5,000+ VIPs"
            value={data.spendersByTier['5000']}
            sub="deposited $5,000 or more"
            icon={<Crown className="h-3.5 w-3.5" />}
          />
          <CohortTile
            tone="gold"
            label="$10,000+ VIPs"
            value={data.spendersByTier['10000']}
            sub="deposited $10,000 or more"
            icon={<Gem className="h-3.5 w-3.5" />}
          />
        </div>

        {/* Lifetime aggregates — 5 tiles. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <AggregateTile
            tone="blue"
            label="Lifetime Deposits"
            value={`$${formatUsd(data.lifetimeDepositsUsd)}`}
            sub={
              data.payingPlayers > 0
                ? `avg $${formatUsd(data.avgDepositPerPayerUsd)} / payer`
                : 'no payers yet'
            }
          />
          <AggregateTile
            tone="red"
            label="Lifetime Withdrawals"
            value={`$${formatUsd(data.lifetimeWithdrawalsUsd)}`}
            sub={
              data.withdrawalsPctBps >= 0
                ? `${(data.withdrawalsPctBps / 100).toFixed(1)}% of deposits`
                : 'no deposits yet'
            }
          />
          <AggregateTile
            tone="gold"
            label="Net House Hold"
            value={signedUsd(data.netHouseHoldUsd)}
            sub={
              data.holdRateBps !== -1
                ? `${(data.holdRateBps / 100).toFixed(1)}% hold rate`
                : 'no deposits yet'
            }
          />
          <AggregateTile
            tone="violet"
            label="Total Wagered"
            value={`${formatSc(data.lifetimeWageredSc)} SC`}
            sub={
              data.betMultiplierBps >= 0
                ? `${(data.betMultiplierBps / 10000).toFixed(1)}× deposits`
                : 'no deposits yet'
            }
          />
          <AggregateTile
            tone="sky"
            label="Total Won"
            value={`${formatSc(data.lifetimeWonSc)} SC`}
            sub={
              data.winPctBps >= 0
                ? `${(data.winPctBps / 100).toFixed(1)}% of wagered`
                : 'no wagers yet'
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

type CohortTone = 'neutral' | 'green' | 'gold'

function CohortTile({
  label,
  value,
  sub,
  tone,
  icon,
  href,
}: {
  label: string
  value: number
  sub: string
  tone: CohortTone
  icon?: React.ReactNode
  href?: string
}) {
  const cls =
    tone === 'green'
      ? 'border-positive/30 bg-positive/5 hover:bg-positive/10 text-positive'
      : tone === 'gold'
        ? 'border-attention/30 bg-attention/5 hover:bg-attention/10 text-attention'
        : 'border-line-subtle bg-base hover:bg-surface-hover text-ink-primary'
  const valueCls =
    tone === 'green' ? 'text-positive' : tone === 'gold' ? 'text-attention' : 'text-ink-primary'
  const tile = (
    <div className={`flex flex-col gap-1 rounded-md border p-3 transition-colors ${cls}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-90">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums tracking-tight ${valueCls}`}
        title={value.toLocaleString()}
      >
        {formatCount(value)}
      </div>
      <div className="truncate text-[11px] text-ink-tertiary">{sub}</div>
    </div>
  )
  if (href) {
    return (
      <a
        href={href}
        className="block focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
      >
        {tile}
      </a>
    )
  }
  return tile
}

type AggregateTone = 'blue' | 'red' | 'gold' | 'violet' | 'sky'

function AggregateTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: AggregateTone
}) {
  // Each aggregate gets a single accent color so the eye groups them
  // (deposits in / withdrawals out / hold / wagered / won) the way the
  // Frenzy Creator widget does — without going rainbow.
  const valueCls =
    tone === 'blue'
      ? 'text-info'
      : tone === 'red'
        ? 'text-critical'
        : tone === 'gold'
          ? 'text-attention'
          : tone === 'violet'
            ? 'text-violet-400'
            : 'text-sky-400'
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line-subtle bg-base p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div
        className={`truncate text-xl font-semibold tabular-nums tracking-tight ${valueCls}`}
        title={value}
      >
        {value}
      </div>
      <div className="truncate text-[11px] text-ink-tertiary">{sub}</div>
    </div>
  )
}

function signedUsd(minor: string): string {
  const big = BigInt(minor)
  if (big < 0n) return `−$${formatUsd((-big).toString())}`
  return `$${formatUsd(minor)}`
}

/** Compact integer for cohort counts. Mirrors formatCompactInt from /lib. */
function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1_000) return n.toLocaleString()
  if (n < 1_000_000) {
    const tenths = Math.round((n * 10) / 1_000)
    return `${(tenths / 10).toFixed(1).replace(/\.0$/, '')}K`
  }
  if (n < 1_000_000_000) {
    const tenths = Math.round((n * 10) / 1_000_000)
    return `${(tenths / 10).toFixed(1).replace(/\.0$/, '')}M`
  }
  return `${(n / 1_000_000_000).toFixed(1)}B`
}

/* -------------------------------------------------------------------------- */
/* Drill-down cards (existing)                                                  */
/* -------------------------------------------------------------------------- */

function BonusBreakdownCard({ rows }: { rows: BonusRowJson[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonus breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No bonus awards yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle">
                <th className="py-2 pr-3 text-left text-xs font-medium text-ink-tertiary">Type</th>
                <th className="py-2 pl-3 text-right text-xs font-medium text-ink-tertiary">
                  Today
                </th>
                <th className="py-2 pl-3 text-right text-xs font-medium text-ink-tertiary">
                  Yesterday
                </th>
                <th className="py-2 pl-3 text-right text-xs font-medium text-ink-tertiary">MTD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bonusType} className="border-b border-line-subtle last:border-b-0">
                  <td className="py-2 pr-3 text-sm capitalize text-ink-primary">
                    {r.bonusType.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2 pl-3 text-right text-sm tabular-nums text-ink-primary">
                    {formatSc(r.todaySc)}
                  </td>
                  <td className="py-2 pl-3 text-right text-sm tabular-nums text-ink-secondary">
                    {formatSc(r.yesterdaySc)}
                  </td>
                  <td className="py-2 pl-3 text-right text-sm tabular-nums text-ink-secondary">
                    {formatSc(r.mtdSc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function LoginCustomerCard({ snapshots }: { snapshots: SnapshotJson[] }) {
  const last7 = snapshots.slice(0, 7)
  const last30 = snapshots.slice(0, 30)
  const sumDau7 = last7.reduce((a, s) => a + s.dau, 0)
  const sumDau30 = last30.reduce((a, s) => a + s.dau, 0)
  const sumLogins7 = last7.reduce((a, s) => a + s.uniqueLogins, 0)
  const sumLogins30 = last30.reduce((a, s) => a + s.uniqueLogins, 0)
  const sumNew7 = last7.reduce((a, s) => a + s.newRegistered, 0)
  const sumNew30 = last30.reduce((a, s) => a + s.newRegistered, 0)
  const rows: { label: string; w7: number; w30: number }[] = [
    { label: 'DAU sum', w7: sumDau7, w30: sumDau30 },
    { label: 'Unique logins', w7: sumLogins7, w30: sumLogins30 },
    { label: 'New signups', w7: sumNew7, w30: sumNew30 },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Login &amp; customer data</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle">
              <th className="py-2 pr-3 text-left text-xs font-medium text-ink-tertiary">Metric</th>
              <th className="py-2 pl-3 text-right text-xs font-medium text-ink-tertiary">7d</th>
              <th className="py-2 pl-3 text-right text-xs font-medium text-ink-tertiary">30d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line-subtle last:border-b-0">
                <td className="py-2 pr-3 text-sm text-ink-primary">{r.label}</td>
                <td className="py-2 pl-3 text-right text-sm tabular-nums text-ink-primary">
                  {r.w7.toLocaleString()}
                </td>
                <td className="py-2 pl-3 text-right text-sm tabular-nums text-ink-secondary">
                  {r.w30.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function sumBig(
  snapshots: SnapshotJson[],
  key: 'ggr' | 'ngr' | 'scStaked' | 'depositsUsd' | 'bonusTotal',
): string {
  let total = 0n
  for (const s of snapshots) total += BigInt(s[key])
  return total.toString()
}

/** Format minor-unit bigint (4 decimals) as 1,234,567.89 (2dp). */
function formatSc(value: string | bigint): string {
  const v = typeof value === 'bigint' ? value : BigInt(value)
  const major = v / 10000n
  const fraction = v % 10000n
  const sign = v < 0n ? '-' : ''
  const absMajor = major < 0n ? -major : major
  const absFraction = fraction < 0n ? -fraction : fraction
  const fractionPad = absFraction.toString().padStart(4, '0').slice(0, 2)
  return `${sign}${formatThousands(absMajor.toString())}.${fractionPad}`
}

function formatUsd(value: string | bigint): string {
  return formatSc(value)
}

function formatThousands(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function moneyToNumber(value: string): number {
  const v = BigInt(value)
  return Number(v) / 10_000
}

/**
 * Percentage delta of two minor-unit money strings (current vs previous).
 * Returns null when previous is zero (no meaningful baseline) or when both
 * sides are zero.
 */
function pctDelta(current: string, previous: string): number | null {
  const cur = BigInt(current)
  const prev = BigInt(previous)
  if (prev === 0n) return null
  const diff = Number(cur - prev) / Number(prev)
  if (!Number.isFinite(diff)) return null
  return diff
}

function pctDeltaInt(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}
