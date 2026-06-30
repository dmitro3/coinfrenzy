import 'server-only'

import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// Server-side data layer for /admin/players. Filters are passed in as plain
// strings; the page parses URL query params and forwards them here.

export interface PlayersListFilters {
  search?: string
  status?: 'all' | 'active' | 'suspended' | 'self_excluded' | 'closed'
  kycLevel?: 'all' | '0' | '1' | '2' | '3'
  state?: string // 2-letter code or 'all'
  quickFilter?: 'all' | 'active' | 'high-value' | 'new' | 'at-risk'
}

export interface PlayersListRow {
  id: string
  email: string
  username: string | null
  displayName: string | null
  state: string | null
  status: string
  kycLevel: number
  scBalance: bigint
  gcBalance: bigint
  /** Lifetime USD purchased (was previously called "lifetimeSpendUsd"). */
  lifetimeSpendUsd: bigint
  /** Lifetime USD redeemed. */
  lifetimeRedeemedUsd: bigint
  /** Operator net position = spend − redeemed. Positive = house up. */
  netPositionUsd: bigint
  purchaseCount: number
  redemptionCount: number
  /** Lifetime SC wagered (Total Bet). */
  totalWageredSc: bigint
  /** Number of game rounds played, lifetime ("spins"). */
  roundCount: number
  /** Number of game sessions played, lifetime. */
  sessionCount: number
  /** Number of distinct calendar days the player was active. */
  daysActive: number
  lastSeenAt: string | null
  lastPurchaseAt: string | null
}

export async function fetchPlayersList(filters: PlayersListFilters): Promise<{
  rows: PlayersListRow[]
  totalCount: number
  filteredCount: number
}> {
  const db = getDb()

  // 1) Total count of non-internal players (the "Y" in "X of Y").
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.players)
    .where(eq(schema.players.isInternalAccount, false))
  const totalCount = Number(totalRow?.count ?? 0)

  // 2) Build the where clause for filters.
  const conditions = [eq(schema.players.isInternalAccount, false)]

  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(schema.players.email, q),
        ilike(schema.players.username, q),
        ilike(schema.players.displayName, q),
        ilike(schema.players.firstName, q),
        ilike(schema.players.lastName, q),
      )!,
    )
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(schema.players.status, filters.status))
  }

  if (filters.kycLevel && filters.kycLevel !== 'all') {
    conditions.push(eq(schema.players.kycLevel, Number(filters.kycLevel)))
  }

  if (filters.state && filters.state !== 'all') {
    conditions.push(eq(schema.players.state, filters.state))
  }

  // Quick filters (mutually exclusive with each other).
  switch (filters.quickFilter) {
    case 'active':
      conditions.push(eq(schema.players.status, 'active'))
      break
    case 'new': {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      conditions.push(sql`${schema.players.firstSeenAt} >= ${sevenDaysAgo}`)
      break
    }
    case 'at-risk':
      conditions.push(inArray(schema.players.status, ['suspended', 'self_excluded']))
      break
    // 'high-value' is filtered post-join (see below).
    // 'all' applies no extra filter.
    default:
      break
  }

  // 3) Pull rows + their wallet aggregates + the rich lifetime stats in one
  //    shot. We pull more fields than the previous query (redeemed, net,
  //    purchase/redemption counts, total wagered, rounds, sessions, days
  //    active) because the players list now surfaces a money triad and an
  //    activity column. All joins are LEFT so a missing wallet or missing
  //    stats row yields 0 rather than excluding the player.
  const rows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      username: schema.players.username,
      displayName: schema.players.displayName,
      state: schema.players.state,
      status: schema.players.status,
      kycLevel: schema.players.kycLevel,
      lastSeenAt: schema.players.lastSeenAt,
      scBalance: sql<string>`coalesce(sc.current_balance::text, '0')`,
      gcBalance: sql<string>`coalesce(gc.current_balance::text, '0')`,
      lifetimeSpendUsd: sql<string>`coalesce(stats.total_deposited_usd::text, '0')`,
      lifetimeRedeemedUsd: sql<string>`coalesce(stats.total_redeemed_usd::text, '0')`,
      netPositionUsd: sql<string>`coalesce(stats.net_position_usd::text, '0')`,
      purchaseCount: sql<number>`coalesce(stats.purchase_count, 0)`,
      redemptionCount: sql<number>`coalesce(stats.redemption_count, 0)`,
      totalWageredSc: sql<string>`coalesce(stats.total_wagered_sc::text, '0')`,
      roundCount: sql<number>`coalesce(stats.round_count, 0)`,
      sessionCount: sql<number>`coalesce(stats.session_count, 0)`,
      daysActive: sql<number>`coalesce(stats.days_active, 0)`,
      lastPurchaseAt: sql<Date | null>`stats.last_purchase_at`,
    })
    .from(schema.players)
    .leftJoin(
      sql`(SELECT player_id, current_balance FROM wallets WHERE currency = 'SC') AS sc`,
      sql`sc.player_id = ${schema.players.id}`,
    )
    .leftJoin(
      sql`(SELECT player_id, current_balance FROM wallets WHERE currency = 'GC') AS gc`,
      sql`gc.player_id = ${schema.players.id}`,
    )
    .leftJoin(sql`player_lifetime_stats AS stats`, sql`stats.player_id = ${schema.players.id}`)
    .where(and(...conditions))
    .orderBy(desc(schema.players.firstSeenAt))
    .limit(1000)

  let mapped: PlayersListRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    username: r.username,
    displayName: r.displayName,
    state: r.state,
    status: r.status,
    kycLevel: r.kycLevel,
    scBalance: parseDecimal(r.scBalance),
    gcBalance: parseDecimal(r.gcBalance),
    lifetimeSpendUsd: parseDecimal(r.lifetimeSpendUsd),
    lifetimeRedeemedUsd: parseDecimal(r.lifetimeRedeemedUsd),
    netPositionUsd: parseDecimal(r.netPositionUsd),
    purchaseCount: Number(r.purchaseCount ?? 0),
    redemptionCount: Number(r.redemptionCount ?? 0),
    totalWageredSc: parseDecimal(r.totalWageredSc),
    roundCount: Number(r.roundCount ?? 0),
    sessionCount: Number(r.sessionCount ?? 0),
    daysActive: Number(r.daysActive ?? 0),
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    lastPurchaseAt: r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toISOString() : null,
  }))

  if (filters.quickFilter === 'high-value') {
    const oneThousandUsdMinor = 1_000n * 10_000n
    mapped = mapped.filter((r) => r.lifetimeSpendUsd >= oneThousandUsdMinor)
  }

  return {
    rows: mapped,
    totalCount,
    filteredCount: mapped.length,
  }
}

function parseDecimal(value: string | null | undefined): bigint {
  if (!value) return 0n
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = abs.split('.')
  const padded = fraction.padEnd(4, '0').slice(0, 4)
  const combined = `${whole}${padded}`.replace(/^0+(\d)/, '$1') || '0'
  return negative ? -BigInt(combined) : BigInt(combined)
}
