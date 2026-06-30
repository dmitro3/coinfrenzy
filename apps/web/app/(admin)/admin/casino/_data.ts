import 'server-only'

import { count, eq, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

const SCALE = 10_000n

/* -------------------------------------------------------------------------- */
/* Providers                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProviderRow {
  id: string
  slug: string
  displayName: string
  status: string
  aggregator: string
  gameCount: number
  plays30d: number
  ggr30dSc: bigint
  rtpAvg: number | null
}

export async function fetchProviders(): Promise<ProviderRow[]> {
  const db = getDb()
  // ISO string — postgres-js can't bind a raw JS Date as a parameter
  // when used inside a `db.execute(sql`...`)` raw query (no column type
  // context). It throws "string argument must be of type string... Date".
  const cutoff = daysAgo(30).toISOString()

  const providers = await db
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

  const games = await db
    .select({
      providerId: schema.games.providerId,
      gameCount: count().as('game_count'),
      avgRtp: sql<string>`avg(${schema.games.rtp})::text`.as('avg_rtp'),
    })
    .from(schema.games)
    .groupBy(schema.games.providerId)

  const gameMap = new Map(games.map((g) => [g.providerId, g]))

  // Plays + GGR per provider (last 30d) from ledger metadata.providerId.
  // We use a SQL aggregation against ledger_entries.
  const playRows = await db.execute(sql`
    SELECT
      (metadata->>'providerId') AS provider_id,
      COUNT(*) FILTER (WHERE source = 'bet') AS plays,
      COALESCE(SUM(CASE WHEN source = 'bet' AND currency = 'SC' THEN amount ELSE 0 END), 0)::text AS bet_sum,
      COALESCE(SUM(CASE WHEN source = 'win' AND currency = 'SC' THEN amount ELSE 0 END), 0)::text AS win_sum
    FROM ledger_entries
    WHERE created_at >= ${cutoff}
      AND metadata ? 'providerId'
    GROUP BY (metadata->>'providerId')
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
    return {
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      status: p.status,
      aggregator: p.aggregator ?? '—',
      gameCount: Number(g?.gameCount ?? 0),
      plays30d: play?.plays ?? 0,
      ggr30dSc: (play?.bet ?? 0n) - (play?.win ?? 0n),
      rtpAvg: g?.avgRtp ? Number(g.avgRtp) : null,
    }
  })
}

export async function fetchProviderDetail(slug: string): Promise<{
  provider: ProviderRow
  games: {
    id: string
    slug: string
    displayName: string
    category: string
    status: string
    rtp: string | null
  }[]
} | null> {
  const db = getDb()
  const providers = await fetchProviders()
  const provider = providers.find((p) => p.slug === slug)
  if (!provider) return null

  const games = await db
    .select({
      id: schema.games.id,
      slug: schema.games.slug,
      displayName: schema.games.displayName,
      category: schema.games.category,
      status: schema.games.status,
      rtp: schema.games.rtp,
    })
    .from(schema.games)
    .where(eq(schema.games.providerId, provider.id))
    .orderBy(schema.games.displayName)

  return {
    provider,
    games: games.map((g) => ({
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      category: g.category,
      status: g.status,
      rtp: g.rtp,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Games                                                                       */
/* -------------------------------------------------------------------------- */

export interface GameRow {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  category: string
  subCategory: string | null
  rtp: string | null
  volatility: string | null
  status: string
  isFeatured: boolean
  isNew: boolean
  playsToday: number
  ggrTodaySc: bigint
}

export async function fetchGames(): Promise<GameRow[]> {
  const db = getDb()
  const todayStart = startOfToday().toISOString()

  const rows = await db
    .select({
      id: schema.games.id,
      slug: schema.games.slug,
      displayName: schema.games.displayName,
      providerId: schema.games.providerId,
      providerName: schema.gameProviders.displayName,
      providerSlug: schema.gameProviders.slug,
      category: schema.games.category,
      subCategory: schema.games.subCategory,
      rtp: schema.games.rtp,
      volatility: schema.games.volatility,
      status: schema.games.status,
      isFeatured: schema.games.isFeatured,
      isNew: schema.games.isNew,
    })
    .from(schema.games)
    .leftJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
    .orderBy(schema.games.displayName)
    .limit(500)

  // Plays today per game from ledger metadata.gameId
  const playRows = await db.execute(sql`
    SELECT
      (metadata->>'gameId') AS game_id,
      COUNT(*) FILTER (WHERE source = 'bet') AS plays,
      COALESCE(SUM(CASE WHEN source = 'bet' AND currency = 'SC' THEN amount ELSE 0 END), 0)::text AS bet_sum,
      COALESCE(SUM(CASE WHEN source = 'win' AND currency = 'SC' THEN amount ELSE 0 END), 0)::text AS win_sum
    FROM ledger_entries
    WHERE created_at >= ${todayStart}
      AND metadata ? 'gameId'
    GROUP BY (metadata->>'gameId')
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
    return {
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      providerName: g.providerName ?? '—',
      providerSlug: g.providerSlug ?? '',
      category: g.category,
      subCategory: g.subCategory,
      rtp: g.rtp,
      volatility: g.volatility,
      status: g.status,
      isFeatured: g.isFeatured,
      isNew: g.isNew,
      playsToday: p?.plays ?? 0,
      ggrTodaySc: (p?.bet ?? 0n) - (p?.win ?? 0n),
    }
  })
}

export async function fetchGameDetail(slug: string): Promise<{
  game: GameRow & {
    minBetSc: string | null
    maxBetSc: string | null
    playthroughWeight: string
    lobbyOrder: number | null
    description: string | null
  }
} | null> {
  const db = getDb()
  const games = await fetchGames()
  const game = games.find((g) => g.slug === slug)
  if (!game) return null

  const [extra] = await db
    .select({
      minBetSc: schema.games.minBetSc,
      maxBetSc: schema.games.maxBetSc,
      playthroughWeight: schema.games.playthroughWeight,
      lobbyOrder: schema.games.lobbyOrder,
    })
    .from(schema.games)
    .where(eq(schema.games.id, game.id))
    .limit(1)

  return {
    game: {
      ...game,
      minBetSc: extra?.minBetSc ? extra.minBetSc.toString() : null,
      maxBetSc: extra?.maxBetSc ? extra.maxBetSc.toString() : null,
      playthroughWeight: extra?.playthroughWeight ?? '1.0',
      lobbyOrder: extra?.lobbyOrder ?? null,
      description: null,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregators + Sub-categories: now live in @coinfrenzy/core/casino.         */
/* See packages/core/src/casino/aggregators.ts + sub-categories.ts.            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

function stringToBigint(value: string): bigint {
  // numeric(20,4) string like "12.3400" → bigint minor units.
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
