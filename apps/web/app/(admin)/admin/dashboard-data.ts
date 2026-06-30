import 'server-only'

import { and, desc, gte, lt, sql } from 'drizzle-orm'

import { reports } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// docs/08 §2 + docs/12 §5 — dashboard data layer.
//
// Each request:
//   - `fetchSliceForRange` — current + previous-period counters parameterized
//     by a `RangeBounds` so the dashboard time-range selector can drive the
//     same data path as the realtime "today" tick.
//   - `fetchSparklineSnapshots` — last 7 days of `daily_operational_snapshots`
//     anchored to the END of the selected range (used by the trend tiles).
//   - `fetchRecentSnapshots` — last N days of snapshots for the
//     login/customer drill-down card.
//   - `fetchIntegrationHealth` — five tiles from `integration_health`.
//
// The returned shapes are bigint-string for money so the client renderer can
// format losslessly without forcing a number.

export interface TodaySlice {
  scStakedToday: bigint
  scWonToday: bigint
  ggrToday: bigint
  ngrToday: bigint
  scAwardedToday: bigint
  depositsToday: bigint
  pendingRedemptions: { count: number; usd: bigint }
  completedRedemptions: { count: number; usd: bigint }
  netCashToday: bigint
  /** Hold % in basis points (1/100 of 1%); -1 = N/A (no bets in range). */
  holdBpsToday: number
  purchaseCountToday: number
  purchasingPlayersToday: number
  signupsToday: number
  netScPosition: bigint
  onlinePlayers: number
  dauToday: number
  firstPurchasersToday: number
  weeklyActive: number
  uniqueLoginsToday: number
  totalPlayersAllTime: number
  totalPurchasersAllTime: number
}

/**
 * Range-aware slice including previous-period values for delta computations.
 * Field names retain their `Today` suffix for backwards compatibility with
 * the realtime channel — they always represent "the selected range" on the
 * server, regardless of the chosen window.
 */
export interface RangeSlice extends TodaySlice {
  previous: TodaySlice
}

export async function fetchTodaySlice(): Promise<TodaySlice> {
  const db = getDb()
  const counters = await reports.computeDashboardCounters(db)
  return countersToSlice(counters)
}

/**
 * Range-independent "who actually pays" cohort breakdown — the eight
 * spender tiles + five lifetime aggregates the founder ported from the
 * Frenzy Creator admin. Cheap query (one indexed scan over
 * `player_lifetime_stats`) so we run it on every dashboard SSR.
 */
export async function fetchMonetizationBreakdown(): Promise<reports.MonetizationBreakdown> {
  const db = getDb()
  return reports.computeMonetizationBreakdown(db)
}

export async function fetchSliceForRange(range: {
  current: { from: Date; to: Date }
  previous: { from: Date; to: Date }
}): Promise<RangeSlice> {
  const db = getDb()
  const [current, previous] = await Promise.all([
    reports.computeDashboardCounters(db, range.current),
    reports.computeDashboardCounters(db, range.previous),
  ])
  return {
    ...countersToSlice(current),
    previous: countersToSlice(previous),
  }
}

function countersToSlice(counters: reports.DashboardCounters): TodaySlice {
  return {
    scStakedToday: BigInt(counters.scStakedToday),
    scWonToday: BigInt(counters.scWonToday),
    ggrToday: BigInt(counters.ggrToday),
    ngrToday: BigInt(counters.ngrToday),
    scAwardedToday: BigInt(counters.scAwardedToday),
    depositsToday: BigInt(counters.depositsToday),
    pendingRedemptions: {
      count: counters.pendingRedemptionsCount,
      usd: BigInt(counters.pendingRedemptionsUsd),
    },
    completedRedemptions: {
      count: counters.completedRedemptionsCount,
      usd: BigInt(counters.completedRedemptionsUsd),
    },
    netCashToday: BigInt(counters.netCashToday),
    holdBpsToday: counters.holdBpsToday,
    purchaseCountToday: counters.purchaseCountToday,
    purchasingPlayersToday: counters.purchasingPlayersToday,
    signupsToday: counters.signupsToday,
    netScPosition: BigInt(counters.netScPosition),
    onlinePlayers: counters.onlinePlayers,
    dauToday: counters.dauToday,
    firstPurchasersToday: counters.firstPurchasersToday,
    weeklyActive: counters.weeklyActive,
    uniqueLoginsToday: counters.uniqueLoginsToday,
    totalPlayersAllTime: counters.totalPlayersAllTime,
    totalPurchasersAllTime: counters.totalPurchasersAllTime,
  }
}

export interface SnapshotRow {
  date: string
  dau: number
  uniqueLogins: number
  newRegistered: number
  scStaked: bigint
  ggr: bigint
  ngr: bigint
  bonusTotal: bigint
  depositsUsd: bigint
}

export async function fetchRecentSnapshots(days = 30): Promise<SnapshotRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      date: schema.dailyOperationalSnapshots.date,
      dau: schema.dailyOperationalSnapshots.dau,
      uniqueLogins: schema.dailyOperationalSnapshots.uniqueLogins,
      newRegistered: schema.dailyOperationalSnapshots.newRegisteredPlayers,
      scStaked: schema.dailyOperationalSnapshots.totalScStaked,
      ggr: schema.dailyOperationalSnapshots.totalGgrSc,
      ngr: schema.dailyOperationalSnapshots.totalNgrSc,
      bonusTotal: schema.dailyOperationalSnapshots.bonusTotal,
      depositsUsd: schema.dailyOperationalSnapshots.totalDepositsUsd,
    })
    .from(schema.dailyOperationalSnapshots)
    .orderBy(desc(schema.dailyOperationalSnapshots.date))
    .limit(days)

  return rows.map(toSnapshotRow)
}

/**
 * Snapshot rows that fall within the 7-day sparkline window. Used by the
 * trend tiles which always show 7 days regardless of the selected range, but
 * anchored to the END of that range.
 */
export async function fetchSparklineSnapshots(window: {
  from: Date
  to: Date
}): Promise<SnapshotRow[]> {
  const db = getDb()
  const fromIso = toIsoDate(window.from)
  const toIso = toIsoDate(window.to)
  const rows = await db
    .select({
      date: schema.dailyOperationalSnapshots.date,
      dau: schema.dailyOperationalSnapshots.dau,
      uniqueLogins: schema.dailyOperationalSnapshots.uniqueLogins,
      newRegistered: schema.dailyOperationalSnapshots.newRegisteredPlayers,
      scStaked: schema.dailyOperationalSnapshots.totalScStaked,
      ggr: schema.dailyOperationalSnapshots.totalGgrSc,
      ngr: schema.dailyOperationalSnapshots.totalNgrSc,
      bonusTotal: schema.dailyOperationalSnapshots.bonusTotal,
      depositsUsd: schema.dailyOperationalSnapshots.totalDepositsUsd,
    })
    .from(schema.dailyOperationalSnapshots)
    .where(
      and(
        gte(schema.dailyOperationalSnapshots.date, fromIso),
        lt(schema.dailyOperationalSnapshots.date, toIso),
      ),
    )
    .orderBy(desc(schema.dailyOperationalSnapshots.date))
  return rows.map(toSnapshotRow)
}

function toSnapshotRow(r: {
  date: unknown
  dau: number
  uniqueLogins: number
  newRegistered: number
  scStaked: bigint
  ggr: bigint
  ngr: bigint
  bonusTotal: bigint
  depositsUsd: bigint
}): SnapshotRow {
  return {
    date: String(r.date),
    dau: r.dau,
    uniqueLogins: r.uniqueLogins,
    newRegistered: r.newRegistered,
    scStaked: r.scStaked,
    ggr: r.ggr,
    ngr: r.ngr,
    bonusTotal: r.bonusTotal,
    depositsUsd: r.depositsUsd,
  }
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0')
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export interface BonusTypeBreakdown {
  bonusType: string
  todaySc: bigint
  yesterdaySc: bigint
  mtdSc: bigint
}

/**
 * docs/08 §2.1 fourth row — the 14-type bonus breakdown table. Pulled from
 * `bonuses_awarded` joined with `bonuses` so a new bonus_type added later
 * shows up automatically.
 */
export async function fetchBonusBreakdown(): Promise<BonusTypeBreakdown[]> {
  const db = getDb()
  const rows = await db.execute<{
    bonus_type: string
    today: string | null
    yesterday: string | null
    mtd: string | null
  }>(sql`
    SELECT
      b.bonus_type::text AS bonus_type,
      COALESCE(SUM(ba.sc_amount) FILTER (
        WHERE ba.created_at::date = current_date), 0)::text AS today,
      COALESCE(SUM(ba.sc_amount) FILTER (
        WHERE ba.created_at::date = current_date - INTERVAL '1 day'), 0)::text AS yesterday,
      COALESCE(SUM(ba.sc_amount) FILTER (
        WHERE ba.created_at >= date_trunc('month', current_date)), 0)::text AS mtd
    FROM bonuses b
    LEFT JOIN bonuses_awarded ba ON ba.bonus_id = b.id
    GROUP BY b.bonus_type
    ORDER BY b.bonus_type
  `)
  return (
    rows as unknown as Array<{
      bonus_type: string
      today: string | null
      yesterday: string | null
      mtd: string | null
    }>
  ).map((r) => ({
    bonusType: r.bonus_type,
    todaySc: parseDecimalToMinor(r.today),
    yesterdaySc: parseDecimalToMinor(r.yesterday),
    mtdSc: parseDecimalToMinor(r.mtd),
  }))
}

export async function fetchIntegrationHealth(): Promise<
  Array<{
    name: string
    state: 'green' | 'yellow' | 'red' | 'unknown'
    lastSeenAt: string | null
    errorCount1h: number
  }>
> {
  const db = getDb()
  const rows = await db
    .select({
      provider: schema.integrationHealth.provider,
      status: schema.integrationHealth.status,
      lastSuccessAt: schema.integrationHealth.lastSuccessAt,
      errorCount1h: schema.integrationHealth.errorCount1h,
    })
    .from(schema.integrationHealth)

  const expected = ['alea', 'finix', 'footprint', 'radar', 'inngest']
  const seen = new Map(rows.map((r) => [r.provider, r]))

  return expected.map((p) => {
    const r = seen.get(p)
    if (!r) {
      return {
        name: pretty(p),
        state: 'green' as const,
        lastSeenAt: null,
        errorCount1h: 0,
      }
    }
    const allowed = ['green', 'yellow', 'red', 'unknown'] as const
    const state = (allowed as readonly string[]).includes(r.status)
      ? (r.status as (typeof allowed)[number])
      : 'unknown'
    return {
      name: pretty(p),
      state,
      lastSeenAt: r.lastSuccessAt ? r.lastSuccessAt.toISOString() : null,
      errorCount1h: r.errorCount1h ?? 0,
    }
  })
}

function pretty(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

function parseDecimalToMinor(value: string | null | undefined): bigint {
  if (!value || value === '0' || value === '0.0000') return 0n
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = abs.split('.')
  const padded = fraction.padEnd(4, '0').slice(0, 4)
  const combined = `${whole}${padded}`.replace(/^0+(\d)/, '$1') || '0'
  const result = BigInt(combined)
  return negative ? -result : result
}
