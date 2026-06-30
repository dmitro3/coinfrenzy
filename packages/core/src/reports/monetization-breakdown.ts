import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@coinfrenzy/db/client'

// Spend-cohort breakdown for the admin dashboard "Monetization — who
// actually pays" section. Mirrors the eight spender tiles + five lifetime
// aggregate tiles from the Frenzy Creator admin (per the founder's spec).
//
// Everything here is range-independent / all-time. The hero (GGR + Net
// Cash) covers the range-scoped view; this section answers a different
// question — "what does my paying-player base look like right now?"

/** Lifetime-deposit thresholds (USD major units) used to bucket each player. */
export const SPENDER_TIERS = [100, 500, 1_000, 2_500, 5_000, 10_000] as const

export type SpenderTier = (typeof SPENDER_TIERS)[number]

export interface MonetizationBreakdown {
  totalPlayers: number
  payingPlayers: number
  /** Distinct players above each lifetime-deposit threshold. */
  spendersByTier: Record<SpenderTier, number>

  /** Lifetime sums in minor units (1e-4) so the UI formats losslessly. */
  lifetimeDepositsUsd: string
  lifetimeWithdrawalsUsd: string
  lifetimeWageredSc: string
  lifetimeWonSc: string

  /** Avg deposit per paying player, minor units. 0 when nobody paid. */
  avgDepositPerPayerUsd: string
  /** Net house hold = deposits − withdrawals, minor units. */
  netHouseHoldUsd: string

  // All "*Bps" fields are basis points (1/100 of 1%). -1 = N/A so the UI
  // can render "—" rather than dividing by zero.
  /** payingPlayers / totalPlayers. */
  conversionBps: number
  /** withdrawals / deposits. */
  withdrawalsPctBps: number
  /** netHouseHold / deposits. Negative when withdrawals > deposits. */
  holdRateBps: number
  /** wagered / deposits (treats 1 SC ≈ $1). */
  betMultiplierBps: number
  /** won / wagered. */
  winPctBps: number
}

const ZERO = '0'

export function emptyMonetizationBreakdown(): MonetizationBreakdown {
  return {
    totalPlayers: 0,
    payingPlayers: 0,
    spendersByTier: { 100: 0, 500: 0, 1000: 0, 2500: 0, 5000: 0, 10000: 0 },
    lifetimeDepositsUsd: ZERO,
    lifetimeWithdrawalsUsd: ZERO,
    lifetimeWageredSc: ZERO,
    lifetimeWonSc: ZERO,
    avgDepositPerPayerUsd: ZERO,
    netHouseHoldUsd: ZERO,
    conversionBps: -1,
    withdrawalsPctBps: -1,
    holdRateBps: -1,
    betMultiplierBps: -1,
    winPctBps: -1,
  }
}

/**
 * One indexed query, joined left so a player without a stats row still
 * counts in `totalPlayers`. Tier counts use FILTER which Postgres collapses
 * to a single sequential pass over `player_lifetime_stats`.
 */
export async function computeMonetizationBreakdown(db: DbExecutor): Promise<MonetizationBreakdown> {
  const [row] = await db.execute<{
    total_players: string
    paying: string
    w100: string
    w500: string
    w1000: string
    w2500: string
    w5000: string
    w10000: string
    deposits_total: string | null
    redeemed_total: string | null
    wagered_total: string | null
    won_total: string | null
  }>(sql`
    SELECT
      COUNT(*)::text AS total_players,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) > 0)::text AS paying,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) >= 100)::text AS w100,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) >= 500)::text AS w500,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) >= 1000)::text AS w1000,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) >= 2500)::text AS w2500,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) >= 5000)::text AS w5000,
      COUNT(*) FILTER (WHERE COALESCE(s.total_deposited_usd, 0) >= 10000)::text AS w10000,
      COALESCE(SUM(s.total_deposited_usd), 0)::text AS deposits_total,
      COALESCE(SUM(s.total_redeemed_usd), 0)::text AS redeemed_total,
      COALESCE(SUM(s.total_wagered_sc), 0)::text AS wagered_total,
      COALESCE(SUM(s.total_won_sc), 0)::text AS won_total
    FROM players p
    LEFT JOIN player_lifetime_stats s ON s.player_id = p.id
    WHERE p.deleted_at IS NULL
      AND p.is_internal_account = false
  `)

  const totalPlayers = num(row?.total_players)
  const paying = num(row?.paying)
  const deposits = toMinor(row?.deposits_total)
  const withdrawals = toMinor(row?.redeemed_total)
  const wagered = toMinor(row?.wagered_total)
  const won = toMinor(row?.won_total)

  const depositsBig = BigInt(deposits)
  const withdrawalsBig = BigInt(withdrawals)
  const wageredBig = BigInt(wagered)
  const wonBig = BigInt(won)
  const netHouse = depositsBig - withdrawalsBig

  const avgPerPayer = paying > 0 ? (depositsBig / BigInt(paying)).toString() : ZERO
  const conversionBps = totalPlayers > 0 ? Math.round((paying / totalPlayers) * 10000) : -1
  const withdrawalsPctBps =
    depositsBig === 0n ? -1 : Number((withdrawalsBig * 10000n) / depositsBig)
  const holdRateBps = depositsBig === 0n ? -1 : Number((netHouse * 10000n) / depositsBig)
  const betMultiplierBps = depositsBig === 0n ? -1 : Number((wageredBig * 10000n) / depositsBig)
  const winPctBps = wageredBig === 0n ? -1 : Number((wonBig * 10000n) / wageredBig)

  return {
    totalPlayers,
    payingPlayers: paying,
    spendersByTier: {
      100: num(row?.w100),
      500: num(row?.w500),
      1000: num(row?.w1000),
      2500: num(row?.w2500),
      5000: num(row?.w5000),
      10000: num(row?.w10000),
    },
    lifetimeDepositsUsd: deposits,
    lifetimeWithdrawalsUsd: withdrawals,
    lifetimeWageredSc: wagered,
    lifetimeWonSc: won,
    avgDepositPerPayerUsd: avgPerPayer,
    netHouseHoldUsd: netHouse.toString(),
    conversionBps,
    withdrawalsPctBps,
    holdRateBps,
    betMultiplierBps,
    winPctBps,
  }
}

function num(value: string | null | undefined): number {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Convert a numeric(20,4) string to bigint minor units (matches the helper
 * in dashboard-counters.ts — kept private here to avoid cross-file coupling).
 */
function toMinor(value: string | null | undefined): string {
  if (!value) return ZERO
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = abs.split('.')
  const padded = fraction.padEnd(4, '0').slice(0, 4)
  const combined = `${whole}${padded}`.replace(/^0+(\d)/, '$1')
  return `${negative ? '-' : ''}${combined || '0'}`
}
