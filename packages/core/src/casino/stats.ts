import { count, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'

// docs/08 §4.1 / §4.2 — windowed provider + game stats. Drives the
// Providers page (with %-of-total share and #1/#2/#3 ranking) and the
// Game Dashboard top widgets (Players, GGR, Bet, Win, RTP, Hold).

export type StatsWindow = '30d' | '90d' | '180d' | '1y' | 'all'

export const WINDOW_OPTIONS: { value: StatsWindow; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '180d', label: 'Last 180 days' },
  { value: '1y', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
]

function windowToInterval(window: StatsWindow): string | null {
  switch (window) {
    case '30d':
      return '30 days'
    case '90d':
      return '90 days'
    case '180d':
      return '180 days'
    case '1y':
      return '365 days'
    case 'all':
      return null
  }
}

const SCALE = 10_000n
function stringToBigint(value: string): bigint {
  if (!value || value === '0') return 0n
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [majorStr = '0', minorStr = ''] = abs.split('.')
  const major = BigInt(majorStr)
  const minorPadded = minorStr.padEnd(4, '0').slice(0, 4)
  const minor = BigInt(minorPadded || '0')
  const total = major * SCALE + minor
  return negative ? -total : total
}

/* -------------------------------------------------------------------------- */
/* Providers (windowed)                                                       */
/* -------------------------------------------------------------------------- */

export interface ProviderStats {
  id: string
  slug: string
  displayName: string
  status: string
  aggregator: string
  gameCount: number
  plays: number
  bet: bigint
  win: bigint
  ggr: bigint
  rtpAvg: number | null
}

export async function getProviderStats(
  ctx: Context,
  window: StatsWindow,
): Promise<ProviderStats[]> {
  const interval = windowToInterval(window)

  const providers = await ctx.db
    .select({
      id: schema.gameProviders.id,
      slug: schema.gameProviders.slug,
      displayName: schema.gameProviders.displayName,
      status: schema.gameProviders.status,
      aggregator: schema.aggregators.displayName,
    })
    .from(schema.gameProviders)
    .leftJoin(schema.aggregators, eq(schema.aggregators.id, schema.gameProviders.aggregatorId))

  if (providers.length === 0) return []

  const gameStats = await ctx.db
    .select({
      providerId: schema.games.providerId,
      gameCount: count().as('game_count'),
      avgRtp: sql<string>`avg(${schema.games.rtp})::text`.as('avg_rtp'),
    })
    .from(schema.games)
    .groupBy(schema.games.providerId)
  const gameMap = new Map(gameStats.map((g) => [g.providerId, g]))

  const cutoffClause = interval ? sql`AND le.created_at >= now() - (${interval})::interval` : sql``
  const playRows = await ctx.db.execute(sql`
    SELECT
      (le.metadata->>'providerId') AS provider_id,
      COUNT(*) FILTER (WHERE le.source = 'bet') AS plays,
      COALESCE(SUM(CASE WHEN le.source = 'bet' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS bet_sum,
      COALESCE(SUM(CASE WHEN le.source = 'win' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS win_sum
    FROM ledger_entries le
    WHERE le.metadata ? 'providerId'
      ${cutoffClause}
    GROUP BY (le.metadata->>'providerId')
  `)
  const playMap = new Map<string, { plays: number; bet: bigint; win: bigint }>()
  for (const row of playRows as unknown as {
    provider_id: string
    plays: string | number
    bet_sum: string
    win_sum: string
  }[]) {
    playMap.set(row.provider_id, {
      plays: Number(row.plays),
      bet: stringToBigint(row.bet_sum),
      win: stringToBigint(row.win_sum),
    })
  }

  return providers.map((p) => {
    const g = gameMap.get(p.id)
    const play = playMap.get(p.id)
    const bet = play?.bet ?? 0n
    const win = play?.win ?? 0n
    return {
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      status: p.status,
      aggregator: p.aggregator ?? '—',
      gameCount: Number(g?.gameCount ?? 0),
      plays: play?.plays ?? 0,
      bet,
      win,
      ggr: bet - win,
      rtpAvg: g?.avgRtp ? Number(g.avgRtp) : null,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Games (windowed)                                                           */
/* -------------------------------------------------------------------------- */

export interface GameStatsRow {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  category: string
  status: string
  customerFacing: boolean
  rtp: string | null
  volatility: string | null
  isFeatured: boolean
  isNew: boolean
  plays: number
  bet: bigint
  win: bigint
  ggr: bigint
}

export async function getGameStats(ctx: Context, window: StatsWindow): Promise<GameStatsRow[]> {
  const interval = windowToInterval(window)

  const rows = await ctx.db
    .select({
      id: schema.games.id,
      slug: schema.games.slug,
      displayName: schema.games.displayName,
      providerName: schema.gameProviders.displayName,
      providerSlug: schema.gameProviders.slug,
      category: schema.games.category,
      status: schema.games.status,
      customerFacing: schema.games.customerFacing,
      rtp: schema.games.rtp,
      volatility: schema.games.volatility,
      isFeatured: schema.games.isFeatured,
      isNew: schema.games.isNew,
    })
    .from(schema.games)
    .leftJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
    .orderBy(schema.games.displayName)
    .limit(1000)

  const cutoffClause = interval ? sql`AND le.created_at >= now() - (${interval})::interval` : sql``
  const playRows = await ctx.db.execute(sql`
    SELECT
      (le.metadata->>'gameId') AS game_id,
      COUNT(*) FILTER (WHERE le.source = 'bet') AS plays,
      COALESCE(SUM(CASE WHEN le.source = 'bet' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS bet_sum,
      COALESCE(SUM(CASE WHEN le.source = 'win' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS win_sum
    FROM ledger_entries le
    WHERE le.metadata ? 'gameId'
      ${cutoffClause}
    GROUP BY (le.metadata->>'gameId')
  `)
  const playMap = new Map<string, { plays: number; bet: bigint; win: bigint }>()
  for (const row of playRows as unknown as {
    game_id: string
    plays: string | number
    bet_sum: string
    win_sum: string
  }[]) {
    playMap.set(row.game_id, {
      plays: Number(row.plays),
      bet: stringToBigint(row.bet_sum),
      win: stringToBigint(row.win_sum),
    })
  }

  return rows.map((g) => {
    const p = playMap.get(g.id)
    const bet = p?.bet ?? 0n
    const win = p?.win ?? 0n
    return {
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      providerName: g.providerName ?? '—',
      providerSlug: g.providerSlug ?? '',
      category: g.category,
      status: g.status,
      customerFacing: g.customerFacing,
      rtp: g.rtp,
      volatility: g.volatility,
      isFeatured: g.isFeatured,
      isNew: g.isNew,
      plays: p?.plays ?? 0,
      bet,
      win,
      ggr: bet - win,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Game dashboard headline metrics                                            */
/* -------------------------------------------------------------------------- */

export interface GameDashboardTotals {
  totalPlayers: number
  totalBet: bigint
  totalWin: bigint
  totalGgr: bigint
  /** RTP % across the window — totalWin / totalBet * 100 (0 when no bets). */
  rtpPct: number
  /** Hold % across the window — (totalBet - totalWin) / totalBet * 100. */
  holdPct: number
}

export async function getGameDashboardTotals(
  ctx: Context,
  window: StatsWindow,
): Promise<GameDashboardTotals> {
  const interval = windowToInterval(window)
  const cutoffClause = interval ? sql`AND le.created_at >= now() - (${interval})::interval` : sql``

  const result = await ctx.db.execute(sql`
    SELECT
      COUNT(DISTINCT le.player_id) FILTER (WHERE le.source = 'bet') AS players,
      COALESCE(SUM(CASE WHEN le.source = 'bet' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS bet_sum,
      COALESCE(SUM(CASE WHEN le.source = 'win' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS win_sum
    FROM ledger_entries le
    WHERE le.metadata ? 'gameId'
      AND le.currency = 'SC'
      ${cutoffClause}
  `)

  const row = (
    result as unknown as { players: string | number; bet_sum: string; win_sum: string }[]
  )[0]
  const players = row ? Number(row.players ?? 0) : 0
  const bet = row ? stringToBigint(row.bet_sum) : 0n
  const win = row ? stringToBigint(row.win_sum) : 0n
  const ggr = bet - win
  const rtpPct = bet === 0n ? 0 : Number((win * 10_000n) / bet) / 100
  const holdPct = bet === 0n ? 0 : Number((ggr * 10_000n) / bet) / 100

  return {
    totalPlayers: players,
    totalBet: bet,
    totalWin: win,
    totalGgr: ggr,
    rtpPct,
    holdPct,
  }
}
