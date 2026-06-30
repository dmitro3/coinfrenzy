import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@coinfrenzy/db/client'

// docs/12 §9 + docs/08 §2.1 — the live dashboard counter set.
//
// Every value here is computed against an indexed query and the worker
// publishes the bundle every 5 seconds (cron-equivalent: a self-rescheduling
// step) so admin dashboards tick in real time. The same helper is reused by
// the SSR dashboard page so the first render matches what the realtime
// channel will send a moment later.

export interface DashboardCounters {
  /** ISO timestamp the bundle was computed at. */
  updatedAt: string

  // Money — bigint serialized as string for transport. Minor units (1e-4).
  // Field names retain their `Today` suffix for backwards compatibility with
  // the realtime channel (docs/12 §9). On the dashboard server they always
  // represent "the selected range", regardless of the chosen window.
  scStakedToday: string
  scWonToday: string
  ggrToday: string
  ngrToday: string
  scAwardedToday: string
  netScPosition: string
  depositsToday: string
  pendingRedemptionsUsd: string
  /** USD of redemptions completed (paid) within the range. */
  completedRedemptionsUsd: string
  /** Net cash = depositsToday − completedRedemptionsUsd within the range. */
  netCashToday: string

  // Counts.
  pendingRedemptionsCount: number
  /** Completed (paid) redemptions count within the range. */
  completedRedemptionsCount: number
  /** Total purchase records (count) within the range. */
  purchaseCountToday: number
  /** Distinct players who made at least one purchase within the range. */
  purchasingPlayersToday: number
  /** Hold % expressed in basis points: (staked − won) / staked × 10000. -1 = N/A (no bets). */
  holdBpsToday: number
  onlinePlayers: number
  dauToday: number
  signupsToday: number
  firstPurchasersToday: number
  weeklyActive: number
  uniqueLoginsToday: number
  /** Cumulative non-internal players ever registered (range-independent). */
  totalPlayersAllTime: number
  /** Cumulative non-internal players who ever made a purchase (range-independent). */
  totalPurchasersAllTime: number
}

/**
 * Bounds for a counter computation. Both bounds are UTC; the half-open window
 * `[from, to)` matches the SQL filter style used everywhere else in the file.
 */
export interface CounterRange {
  from: Date
  to: Date
}

const ZERO = '0'

export function emptyCounters(): DashboardCounters {
  return {
    updatedAt: new Date().toISOString(),
    scStakedToday: ZERO,
    scWonToday: ZERO,
    ggrToday: ZERO,
    ngrToday: ZERO,
    scAwardedToday: ZERO,
    netScPosition: ZERO,
    depositsToday: ZERO,
    pendingRedemptionsUsd: ZERO,
    completedRedemptionsUsd: ZERO,
    netCashToday: ZERO,
    pendingRedemptionsCount: 0,
    completedRedemptionsCount: 0,
    purchaseCountToday: 0,
    purchasingPlayersToday: 0,
    holdBpsToday: -1,
    onlinePlayers: 0,
    dauToday: 0,
    signupsToday: 0,
    firstPurchasersToday: 0,
    weeklyActive: 0,
    uniqueLoginsToday: 0,
    totalPlayersAllTime: 0,
    totalPurchasersAllTime: 0,
  }
}

/**
 * Convert a numeric(20,4) string to bigint minor units. Returns "0" when
 * the value is null/undefined/empty.
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

/**
 * Compute the live counter bundle. All queries hit indexed columns; total
 * runtime is < 200ms in our perf budget (docs/12 §9). The function returns
 * money values as bigint-strings so the result can cross the network or be
 * serialized into a worker payload without loss of precision.
 *
 * Pass `range` to compute counters over an arbitrary window (used by the
 * dashboard time-range selector). When omitted, the function computes the
 * "today" window (midnight UTC → next midnight UTC), matching the realtime
 * 5-second tick in docs/12 §9.
 */
export async function computeDashboardCounters(
  db: DbExecutor,
  range?: CounterRange,
): Promise<DashboardCounters> {
  const startSql = range
    ? sql`${range.from.toISOString()}::timestamptz`
    : sql`date_trunc('day', now() AT TIME ZONE 'UTC')`
  const endSql = range
    ? sql`${range.to.toISOString()}::timestamptz`
    : sql`date_trunc('day', now() AT TIME ZONE 'UTC') + INTERVAL '1 day'`

  const [ledgerRow] = await db.execute<{
    sc_staked: string | null
    sc_won: string | null
    sc_awarded: string | null
  }>(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE source = 'bet' AND currency = 'SC' AND leg = 'credit'
          AND account_kind IN ('house_winnings_sc')
      ), 0)::text AS sc_staked,
      COALESCE(SUM(amount) FILTER (
        WHERE source = 'win' AND currency = 'SC' AND leg = 'debit'
          AND account_kind IN ('house_winnings_sc')
      ), 0)::text AS sc_won,
      COALESCE(SUM(amount) FILTER (
        WHERE source IN ('bonus_award', 'playthrough_release') AND currency = 'SC'
          AND leg = 'credit' AND account_kind = 'player_wallet'
      ), 0)::text AS sc_awarded
    FROM ledger_entries
    WHERE created_at >= ${startSql}
      AND created_at <  ${endSql}
  `)

  const scStaked = toMinor(ledgerRow?.sc_staked)
  const scWon = toMinor(ledgerRow?.sc_won)
  const scAwarded = toMinor(ledgerRow?.sc_awarded)

  const ggr = (BigInt(scStaked) - BigInt(scWon)).toString()
  const ngr = (BigInt(ggr) - BigInt(scAwarded)).toString()

  // Hold % = (staked − won) / staked, expressed in basis points so we don't
  // round in the DB layer. -1 sentinels "N/A" so the UI can render "—".
  const stakedBig = BigInt(scStaked)
  const holdBps = stakedBig === 0n ? -1 : Number((BigInt(ggr) * 10000n) / stakedBig)

  const [depositsRow] = await db.execute<{
    total: string | null
    first_count: string | null
    cnt: string | null
    distinct_players: string | null
  }>(sql`
    SELECT
      COALESCE(SUM(amount_usd), 0)::text AS total,
      COUNT(*)::text AS cnt,
      COUNT(DISTINCT player_id)::text AS distinct_players,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM purchases p2
          WHERE p2.player_id = purchases.player_id
            AND p2.status = 'completed'
            AND p2.completed_at < purchases.completed_at
        )
      )::text AS first_count
    FROM purchases
    WHERE status = 'completed'
      AND completed_at >= ${startSql}
      AND completed_at <  ${endSql}
  `)

  const [pendingRow] = await db.execute<{ cnt: string; usd: string | null }>(sql`
    SELECT
      COUNT(*)::text AS cnt,
      COALESCE(SUM(amount_usd), 0)::text AS usd
    FROM redemptions
    WHERE status IN ('requested','pending_review','kyc_pending','approved','submitted','awaiting_webhook','aml_hold')
  `)

  // Completed (paid) redemptions within the range — used by Net Cash and the
  // hero "Redemptions" tile. We pick `paid_at` rather than `created_at` so
  // the row counts only when the cash actually leaves the operator.
  const [completedRedemptionsRow] = await db.execute<{ cnt: string; usd: string | null }>(sql`
    SELECT
      COUNT(*)::text AS cnt,
      COALESCE(SUM(amount_usd), 0)::text AS usd
    FROM redemptions
    WHERE status = 'paid'
      AND paid_at IS NOT NULL
      AND paid_at >= ${startSql}
      AND paid_at <  ${endSql}
  `)

  // All-time aggregates — these are intentionally range-independent so the
  // hero shows "Total Players: N" regardless of the selected window.
  const [allTimeRow] = await db.execute<{
    total_players: string
    total_purchasers: string
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text
       FROM players
       WHERE deleted_at IS NULL AND is_internal_account = false) AS total_players,
      (SELECT COUNT(DISTINCT player_id)::text
       FROM purchases
       WHERE status = 'completed') AS total_purchasers
  `)

  const [signupsRow] = await db.execute<{ c: string }>(sql`
    SELECT COUNT(*)::text AS c
    FROM players
    WHERE created_at >= ${startSql}
      AND created_at <  ${endSql}
      AND is_internal_account = false
      AND deleted_at IS NULL
  `)

  // "Online players" = distinct non-internal players with a not-yet-expired
  // auth_session whose token was touched in the last 15 minutes, OR whose
  // players.last_seen_at heartbeat falls inside the same window. We union
  // both signals because Better Auth bumps auth_session.updated_at on each
  // session refresh while last_seen_at is updated on login + ledger writes;
  // taking the max of the two is the closest approximation to "active in
  // the last 15 minutes" the schema gives us.
  //
  // Online stays a fixed 15-min window even when the dashboard range
  // selector is set to a longer period — by user requirement.
  const [activityRow] = await db.execute<{
    online: string
    dau: string
    weekly: string
    unique_logins: string
  }>(sql`
    WITH active_sessions AS (
      SELECT DISTINCT s.user_id
      FROM auth_session s
      WHERE s.expires_at > now()
        AND s.updated_at >= now() - INTERVAL '15 minutes'
    )
    SELECT
      COUNT(*) FILTER (
        WHERE p.last_seen_at >= now() - INTERVAL '15 minutes'
           OR EXISTS (
             SELECT 1 FROM active_sessions a WHERE a.user_id = p.id::text
           )
      )::text AS online,
      COUNT(*) FILTER (
        WHERE p.last_login_at >= ${startSql}
          AND p.last_login_at <  ${endSql}
      )::text AS dau,
      COUNT(*) FILTER (
        WHERE p.last_login_at >= now() - INTERVAL '7 days'
      )::text AS weekly,
      COUNT(*) FILTER (
        WHERE p.last_login_at >= ${startSql}
          AND p.last_login_at <  ${endSql}
      )::text AS unique_logins
    FROM players p
    WHERE p.deleted_at IS NULL AND p.is_internal_account = false
  `)

  const [walletRow] = await db.execute<{ total: string | null }>(sql`
    SELECT COALESCE(SUM(current_balance), 0)::text AS total
    FROM wallets
    WHERE currency = 'SC'
  `)

  const depositsTotal = toMinor(depositsRow?.total)
  const completedRedemptionsTotal = toMinor(completedRedemptionsRow?.usd)
  const netCash = (BigInt(depositsTotal) - BigInt(completedRedemptionsTotal)).toString()

  return {
    updatedAt: new Date().toISOString(),
    scStakedToday: scStaked,
    scWonToday: scWon,
    ggrToday: ggr,
    ngrToday: ngr,
    scAwardedToday: scAwarded,
    netScPosition: toMinor(walletRow?.total),
    depositsToday: depositsTotal,
    pendingRedemptionsUsd: toMinor(pendingRow?.usd),
    completedRedemptionsUsd: completedRedemptionsTotal,
    netCashToday: netCash,
    pendingRedemptionsCount: Number(pendingRow?.cnt ?? 0),
    completedRedemptionsCount: Number(completedRedemptionsRow?.cnt ?? 0),
    purchaseCountToday: Number(depositsRow?.cnt ?? 0),
    purchasingPlayersToday: Number(depositsRow?.distinct_players ?? 0),
    holdBpsToday: holdBps,
    onlinePlayers: Number(activityRow?.online ?? 0),
    dauToday: Number(activityRow?.dau ?? 0),
    signupsToday: Number(signupsRow?.c ?? 0),
    firstPurchasersToday: Number(depositsRow?.first_count ?? 0),
    weeklyActive: Number(activityRow?.weekly ?? 0),
    uniqueLoginsToday: Number(activityRow?.unique_logins ?? 0),
    totalPlayersAllTime: Number(allTimeRow?.total_players ?? 0),
    totalPurchasersAllTime: Number(allTimeRow?.total_purchasers ?? 0),
  }
}
