import 'server-only'

import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

const SCALE = 10_000n

/** Convert a 'YYYY-MM-DD' string to a Date at midnight UTC. */
function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function endOfDay(d: Date): Date {
  const next = new Date(d.getTime())
  next.setUTCHours(23, 59, 59, 999)
  return next
}

/** Translate quick presets into a Date range. Returns null bounds to mean "no constraint". */
function quickRangeBounds(quick: string | undefined): { from: Date | null; to: Date | null } {
  const now = new Date()
  switch (quick) {
    case 'today':
      return { from: startOfToday(), to: null }
    case '7d':
      return { from: new Date(now.getTime() - 7 * 24 * 3600 * 1000), to: null }
    case '30d':
      return { from: new Date(now.getTime() - 30 * 24 * 3600 * 1000), to: null }
    case '90d':
      return { from: new Date(now.getTime() - 90 * 24 * 3600 * 1000), to: null }
    default:
      return { from: null, to: null }
  }
}

/** Merge quick-preset bounds with explicit from/to params (explicit wins). */
function mergeDateRange(filters: { quick?: string; from?: string; to?: string }): {
  from: Date | null
  to: Date | null
} {
  const fromExplicit = parseIsoDate(filters.from)
  const toExplicit = parseIsoDate(filters.to)
  const quick = quickRangeBounds(filters.quick)
  return {
    from: fromExplicit ?? quick.from,
    to: toExplicit ? endOfDay(toExplicit) : quick.to,
  }
}

/** Parse minor-unit amount string ("100.00" → 1000000n minor units). */
function parseAmountFilter(s: string | undefined): bigint | null {
  if (!s || s.trim() === '') return null
  const trimmed = s.trim()
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return null
  const [major = '0', frac = ''] = trimmed.split('.')
  const fracPadded = frac.padEnd(4, '0').slice(0, 4)
  return BigInt(major) * SCALE + BigInt(fracPadded || '0')
}

/* -------------------------------------------------------------------------- */
/* Purchases                                                                   */
/* -------------------------------------------------------------------------- */

export interface PurchaseListRow {
  id: string
  createdAt: string
  playerEmail: string
  playerId: string
  amountUsd: bigint
  baseGc: bigint
  baseSc: bigint
  bonusGc: bigint
  bonusSc: bigint
  cardBrand: string | null
  cardLast4: string | null
  status: string
  packageName: string | null
}

export async function fetchPurchases(filters: {
  status?: string
  quick?: 'all' | 'today' | '7d' | '30d' | 'failed' | 'disputed' | 'refunded'
  from?: string
  to?: string
  minUsd?: string
  maxUsd?: string
}): Promise<PurchaseListRow[]> {
  const db = getDb()
  const wheres = []
  if (filters.status && filters.status !== 'all') {
    wheres.push(eq(schema.purchases.status, filters.status))
  }
  if (filters.quick === 'failed') {
    wheres.push(eq(schema.purchases.status, 'failed'))
  } else if (filters.quick === 'disputed') {
    wheres.push(eq(schema.purchases.status, 'disputed'))
  } else if (filters.quick === 'refunded') {
    wheres.push(eq(schema.purchases.status, 'refunded'))
  }

  const range = mergeDateRange({ quick: filters.quick, from: filters.from, to: filters.to })
  if (range.from) wheres.push(gte(schema.purchases.createdAt, range.from))
  if (range.to) wheres.push(lte(schema.purchases.createdAt, range.to))

  const minAmount = parseAmountFilter(filters.minUsd)
  const maxAmount = parseAmountFilter(filters.maxUsd)
  if (minAmount !== null) wheres.push(gte(schema.purchases.amountUsd, minAmount))
  if (maxAmount !== null) wheres.push(lte(schema.purchases.amountUsd, maxAmount))

  const rows = await db
    .select({
      id: schema.purchases.id,
      createdAt: schema.purchases.createdAt,
      playerId: schema.purchases.playerId,
      playerEmail: schema.players.email,
      amountUsd: schema.purchases.amountUsd,
      baseGc: schema.purchases.baseGc,
      baseSc: schema.purchases.baseSc,
      bonusGc: schema.purchases.bonusGc,
      bonusSc: schema.purchases.bonusSc,
      cardBrand: schema.purchases.finixCardBrand,
      cardLast4: schema.purchases.finixCardLast4,
      status: schema.purchases.status,
      packageName: schema.packages.displayName,
    })
    .from(schema.purchases)
    .innerJoin(schema.players, eq(schema.players.id, schema.purchases.playerId))
    .leftJoin(schema.packages, eq(schema.packages.id, schema.purchases.packageId))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(schema.purchases.createdAt))
    .limit(500)

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    playerId: r.playerId,
    playerEmail: r.playerEmail,
    amountUsd: r.amountUsd,
    baseGc: r.baseGc,
    baseSc: r.baseSc,
    bonusGc: r.bonusGc,
    bonusSc: r.bonusSc,
    cardBrand: r.cardBrand,
    cardLast4: r.cardLast4,
    status: r.status,
    packageName: r.packageName,
  }))
}

export interface PurchaseInsights {
  todayVolumeUsd: bigint
  todayCount: number
  avgPurchaseUsd: bigint
  failedToday: number
  refundsToday: number
}

export async function fetchPurchaseInsights(): Promise<PurchaseInsights> {
  const db = getDb()
  const start = startOfToday()
  const rows = await db
    .select({
      status: schema.purchases.status,
      amountUsd: schema.purchases.amountUsd,
    })
    .from(schema.purchases)
    .where(gte(schema.purchases.createdAt, start))

  let volume = 0n
  let countCompleted = 0
  let countTotal = 0
  let failed = 0
  let refunds = 0
  for (const r of rows) {
    countTotal++
    if (r.status === 'completed') {
      volume += r.amountUsd
      countCompleted++
    }
    if (r.status === 'failed') failed++
    if (r.status === 'refunded') refunds++
  }
  const avg = countCompleted > 0 ? volume / BigInt(countCompleted) : 0n
  return {
    todayVolumeUsd: volume,
    todayCount: countTotal,
    avgPurchaseUsd: avg,
    failedToday: failed,
    refundsToday: refunds,
  }
}

export async function fetchPurchaseDetail(id: string): Promise<{
  purchase: PurchaseListRow & {
    promoCode: string | null
    finixTransferId: string | null
    failureReason: string | null
    failureMessage: string | null
    completedAt: string | null
  }
  ledgerEntries: { id: string; source: string; leg: string; amount: bigint; currency: string }[]
} | null> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.purchases.id,
      createdAt: schema.purchases.createdAt,
      playerId: schema.purchases.playerId,
      playerEmail: schema.players.email,
      amountUsd: schema.purchases.amountUsd,
      baseGc: schema.purchases.baseGc,
      baseSc: schema.purchases.baseSc,
      bonusGc: schema.purchases.bonusGc,
      bonusSc: schema.purchases.bonusSc,
      cardBrand: schema.purchases.finixCardBrand,
      cardLast4: schema.purchases.finixCardLast4,
      status: schema.purchases.status,
      packageName: schema.packages.displayName,
      promoCode: schema.purchases.promoCode,
      finixTransferId: schema.purchases.finixTransferId,
      failureReason: schema.purchases.failureReason,
      failureMessage: schema.purchases.failureMessage,
      completedAt: schema.purchases.completedAt,
      ledgerPairId: schema.purchases.ledgerPairId,
    })
    .from(schema.purchases)
    .innerJoin(schema.players, eq(schema.players.id, schema.purchases.playerId))
    .leftJoin(schema.packages, eq(schema.packages.id, schema.purchases.packageId))
    .where(eq(schema.purchases.id, id))
    .limit(1)
  const r = rows[0]
  if (!r) return null

  const ledger = r.ledgerPairId
    ? await db
        .select({
          id: schema.ledgerEntries.id,
          source: schema.ledgerEntries.source,
          leg: schema.ledgerEntries.leg,
          amount: schema.ledgerEntries.amount,
          currency: schema.ledgerEntries.currency,
        })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.pairId, r.ledgerPairId))
    : []

  return {
    purchase: {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      playerId: r.playerId,
      playerEmail: r.playerEmail,
      amountUsd: r.amountUsd,
      baseGc: r.baseGc,
      baseSc: r.baseSc,
      bonusGc: r.bonusGc,
      bonusSc: r.bonusSc,
      cardBrand: r.cardBrand,
      cardLast4: r.cardLast4,
      status: r.status,
      packageName: r.packageName,
      promoCode: r.promoCode,
      finixTransferId: r.finixTransferId,
      failureReason: r.failureReason,
      failureMessage: r.failureMessage,
      completedAt: r.completedAt?.toISOString() ?? null,
    },
    ledgerEntries: ledger,
  }
}

/* -------------------------------------------------------------------------- */
/* Redemptions list (broader than cashier _data which only does pending)       */
/* -------------------------------------------------------------------------- */

export interface RedemptionListRow {
  id: string
  createdAt: string
  playerEmail: string
  playerId: string
  amountUsd: bigint
  amountSc: bigint
  method: string
  status: string
  paidAt: string | null
  approvedAt: string | null
  reviewerId: string | null
  kycLevel: number
}

export async function fetchRedemptionsBroad(filters: {
  status?: string
  quick?:
    | 'all'
    | 'today'
    | '7d'
    | '30d'
    | 'pending-review'
    | 'kyc-pending'
    | 'aml-hold'
    | 'paid'
    | 'failed'
  from?: string
  to?: string
  minUsd?: string
  maxUsd?: string
  kycLevel?: string
}): Promise<RedemptionListRow[]> {
  const db = getDb()
  const wheres = []
  if (filters.status && filters.status !== 'all') {
    wheres.push(eq(schema.redemptions.status, filters.status))
  } else if (filters.quick === 'pending-review') {
    wheres.push(eq(schema.redemptions.status, 'pending_review'))
  } else if (filters.quick === 'kyc-pending') {
    wheres.push(eq(schema.redemptions.status, 'kyc_pending'))
  } else if (filters.quick === 'aml-hold') {
    wheres.push(eq(schema.redemptions.status, 'aml_hold'))
  } else if (filters.quick === 'paid') {
    wheres.push(eq(schema.redemptions.status, 'paid'))
  } else if (filters.quick === 'failed') {
    wheres.push(inArray(schema.redemptions.status, ['failed', 'rejected']))
  }

  const range = mergeDateRange({ quick: filters.quick, from: filters.from, to: filters.to })
  if (range.from) wheres.push(gte(schema.redemptions.createdAt, range.from))
  if (range.to) wheres.push(lte(schema.redemptions.createdAt, range.to))

  const minAmount = parseAmountFilter(filters.minUsd)
  const maxAmount = parseAmountFilter(filters.maxUsd)
  if (minAmount !== null) wheres.push(gte(schema.redemptions.amountUsd, minAmount))
  if (maxAmount !== null) wheres.push(lte(schema.redemptions.amountUsd, maxAmount))

  if (filters.kycLevel && filters.kycLevel !== 'all') {
    const lvl = Number(filters.kycLevel)
    if (Number.isFinite(lvl)) wheres.push(eq(schema.players.kycLevel, lvl))
  }

  const rows = await db
    .select({
      id: schema.redemptions.id,
      createdAt: schema.redemptions.createdAt,
      playerId: schema.redemptions.playerId,
      playerEmail: schema.players.email,
      amountUsd: schema.redemptions.amountUsd,
      amountSc: schema.redemptions.amountSc,
      method: schema.redemptions.method,
      status: schema.redemptions.status,
      paidAt: schema.redemptions.paidAt,
      approvedAt: schema.redemptions.approvedAt,
      approvedBy: schema.redemptions.approvedBy,
      kycLevel: schema.players.kycLevel,
    })
    .from(schema.redemptions)
    .innerJoin(schema.players, eq(schema.players.id, schema.redemptions.playerId))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(500)

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    playerId: r.playerId,
    playerEmail: r.playerEmail,
    amountUsd: r.amountUsd,
    amountSc: r.amountSc,
    method: r.method,
    status: r.status,
    paidAt: r.paidAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    reviewerId: r.approvedBy,
    kycLevel: r.kycLevel,
  }))
}

export interface RedemptionInsights {
  todayVolumeUsd: bigint
  todayCount: number
  pendingReview: number
  paidToday: number
  avgProcessingHours: number
}

export async function fetchRedemptionInsights(): Promise<RedemptionInsights> {
  const db = getDb()
  const start = startOfToday()

  const all = await db
    .select({
      status: schema.redemptions.status,
      amountUsd: schema.redemptions.amountUsd,
      createdAt: schema.redemptions.createdAt,
      paidAt: schema.redemptions.paidAt,
    })
    .from(schema.redemptions)

  let todayVolume = 0n
  let todayCount = 0
  let paidToday = 0
  let pendingReview = 0
  let processingMs = 0
  let processingCount = 0

  for (const r of all) {
    if (r.createdAt >= start) {
      todayCount++
      todayVolume += r.amountUsd
      if (r.status === 'paid') paidToday++
    }
    if (r.status === 'pending_review' || r.status === 'kyc_pending') {
      pendingReview++
    }
    if (r.paidAt) {
      processingMs += r.paidAt.getTime() - r.createdAt.getTime()
      processingCount++
    }
  }

  return {
    todayVolumeUsd: todayVolume,
    todayCount,
    pendingReview,
    paidToday,
    avgProcessingHours: processingCount > 0 ? processingMs / processingCount / 3600_000 : 0,
  }
}

export async function fetchRedemptionDetailFull(id: string): Promise<{
  row: RedemptionListRow
  drainPlan: { bucket: string; amount: string }[]
  ledger: { id: string; source: string; leg: string; amount: bigint; currency: string }[]
  player: { email: string; state: string | null; kycLevel: number; status: string }
} | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.redemptions)
    .innerJoin(schema.players, eq(schema.players.id, schema.redemptions.playerId))
    .where(eq(schema.redemptions.id, id))
    .limit(1)
  if (rows.length === 0) return null
  const r = rows[0]!.redemptions
  const p = rows[0]!.players

  const ledger = r.ledgerPairId
    ? await db
        .select({
          id: schema.ledgerEntries.id,
          source: schema.ledgerEntries.source,
          leg: schema.ledgerEntries.leg,
          amount: schema.ledgerEntries.amount,
          currency: schema.ledgerEntries.currency,
        })
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.pairId, r.ledgerPairId))
    : []

  return {
    row: {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      playerId: p.id,
      playerEmail: p.email,
      amountUsd: r.amountUsd,
      amountSc: r.amountSc,
      method: r.method,
      status: r.status,
      paidAt: r.paidAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      reviewerId: r.approvedBy,
      kycLevel: p.kycLevel,
    },
    drainPlan: Array.isArray(r.drainPlan)
      ? (r.drainPlan as { bucket: string; amount: string }[])
      : [],
    ledger,
    player: {
      email: p.email,
      state: p.state,
      kycLevel: p.kycLevel,
      status: p.status,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Bonus awards                                                                */
/* -------------------------------------------------------------------------- */

export interface BonusAwardListRow {
  id: string
  createdAt: string
  playerId: string
  playerEmail: string
  bonusName: string
  bonusType: string
  scAmount: bigint
  gcAmount: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
  status: string
}

export async function fetchBonusAwards(filters: {
  status?: string
  bonusType?: string
  quick?: 'all' | 'today' | '7d' | '30d' | '90d'
  from?: string
  to?: string
  minSc?: string
  maxSc?: string
}): Promise<BonusAwardListRow[]> {
  const db = getDb()
  const wheres = []
  if (filters.status && filters.status !== 'all') {
    wheres.push(eq(schema.bonusesAwarded.status, filters.status))
  }
  if (filters.bonusType && filters.bonusType !== 'all') {
    wheres.push(eq(schema.bonuses.bonusType, filters.bonusType as never))
  }

  const range = mergeDateRange({ quick: filters.quick, from: filters.from, to: filters.to })
  if (range.from) wheres.push(gte(schema.bonusesAwarded.createdAt, range.from))
  if (range.to) wheres.push(lte(schema.bonusesAwarded.createdAt, range.to))

  const minAmount = parseAmountFilter(filters.minSc)
  const maxAmount = parseAmountFilter(filters.maxSc)
  if (minAmount !== null) wheres.push(gte(schema.bonusesAwarded.scAmount, minAmount))
  if (maxAmount !== null) wheres.push(lte(schema.bonusesAwarded.scAmount, maxAmount))

  const rows = await db
    .select({
      id: schema.bonusesAwarded.id,
      createdAt: schema.bonusesAwarded.createdAt,
      playerId: schema.bonusesAwarded.playerId,
      playerEmail: schema.players.email,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      scAmount: schema.bonusesAwarded.scAmount,
      gcAmount: schema.bonusesAwarded.gcAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      status: schema.bonusesAwarded.status,
    })
    .from(schema.bonusesAwarded)
    .innerJoin(schema.players, eq(schema.players.id, schema.bonusesAwarded.playerId))
    .leftJoin(schema.bonuses, eq(schema.bonuses.id, schema.bonusesAwarded.bonusId))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(schema.bonusesAwarded.createdAt))
    .limit(500)
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    playerId: r.playerId,
    playerEmail: r.playerEmail,
    bonusName: r.bonusName ?? 'Unknown bonus',
    bonusType: String(r.bonusType ?? 'unknown'),
    scAmount: r.scAmount,
    gcAmount: r.gcAmount,
    playthroughRequired: r.playthroughRequired,
    playthroughProgress: r.playthroughProgress,
    status: r.status,
  }))
}

export interface BonusAwardInsights {
  todayCount: number
  todayScAwarded: bigint
  topType: string
  completedRate: number
}

export async function fetchBonusAwardInsights(): Promise<BonusAwardInsights> {
  const db = getDb()
  const start = startOfToday()
  const rows = await db
    .select({
      type: schema.bonuses.bonusType,
      sc: schema.bonusesAwarded.scAmount,
      status: schema.bonusesAwarded.status,
      createdAt: schema.bonusesAwarded.createdAt,
    })
    .from(schema.bonusesAwarded)
    .leftJoin(schema.bonuses, eq(schema.bonuses.id, schema.bonusesAwarded.bonusId))

  const typeCounts: Record<string, number> = {}
  let todayCount = 0
  let todaySc = 0n
  let completed = 0
  let total = 0

  for (const r of rows) {
    total++
    typeCounts[String(r.type ?? 'unknown')] = (typeCounts[String(r.type ?? 'unknown')] ?? 0) + 1
    if (r.createdAt >= start) {
      todayCount++
      todaySc += r.sc
    }
    if (r.status === 'completed') completed++
  }
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  return {
    todayCount,
    todayScAwarded: todaySc,
    topType,
    completedRate: total > 0 ? (completed / total) * 100 : 0,
  }
}

/* -------------------------------------------------------------------------- */
/* Casino activity (bet/win ledger)                                            */
/* -------------------------------------------------------------------------- */

export interface CasinoActivityRow {
  id: string
  createdAt: string
  source: 'bet' | 'win'
  amount: bigint
  currency: 'GC' | 'SC'
  playerId: string | null
  playerEmail: string | null
  gameId: string | null
  gameName: string | null
  providerSlug: string | null
  providerName: string | null
  /** From metadata — convenient when staring at one player's run of plays. */
  roundId: string | null
  pairId: string
}

export interface CasinoActivityFilters {
  type?: 'all' | 'bet' | 'win'
  currency?: 'all' | 'SC' | 'GC'
  quick?: 'all' | 'today' | '7d' | '30d' | '90d'
  from?: string
  to?: string
  providerSlug?: string
  minAmount?: string
  maxAmount?: string
  /** Max rows to return — defaults to 1,000 for the page, 50,000 for export. */
  limit?: number
}

export async function fetchCasinoActivity(
  filters: CasinoActivityFilters,
): Promise<CasinoActivityRow[]> {
  const db = getDb()
  const wheres: ReturnType<typeof eq>[] = []

  if (filters.type === 'bet') wheres.push(eq(schema.ledgerEntries.source, 'bet'))
  else if (filters.type === 'win') wheres.push(eq(schema.ledgerEntries.source, 'win'))
  else wheres.push(inArray(schema.ledgerEntries.source, ['bet', 'win']))

  if (filters.currency === 'SC' || filters.currency === 'GC') {
    wheres.push(eq(schema.ledgerEntries.currency, filters.currency))
  }

  const range = mergeDateRange({ quick: filters.quick, from: filters.from, to: filters.to })
  if (range.from) wheres.push(gte(schema.ledgerEntries.createdAt, range.from))
  if (range.to) wheres.push(lte(schema.ledgerEntries.createdAt, range.to))

  const minAmount = parseAmountFilter(filters.minAmount)
  const maxAmount = parseAmountFilter(filters.maxAmount)
  if (minAmount !== null) wheres.push(gte(schema.ledgerEntries.amount, minAmount))
  if (maxAmount !== null) wheres.push(lte(schema.ledgerEntries.amount, maxAmount))

  // For provider filter we need to know each row's gameId before the lookup.
  // Cheapest approach: do an initial query that ALREADY narrows to the
  // provider's games. If no provider filter, we skip this and let the page
  // resolve game names via the gameMap below.
  let providerGameIds: string[] | null = null
  if (filters.providerSlug && filters.providerSlug !== 'all') {
    const games = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .leftJoin(schema.gameProviders, sql`${schema.gameProviders.id} = ${schema.games.providerId}`)
      .where(eq(schema.gameProviders.slug, filters.providerSlug))
    providerGameIds = games.map((g) => g.id)
    if (providerGameIds.length === 0) return []
    wheres.push(
      sql`(${schema.ledgerEntries.metadata} ->> 'gameId') = ANY(ARRAY[${sql.join(
        providerGameIds.map((id) => sql`${id}`),
        sql`, `,
      )}])`,
    )
  }

  const limit = filters.limit ?? 1_000
  const rows = await db
    .select({
      id: schema.ledgerEntries.id,
      createdAt: schema.ledgerEntries.createdAt,
      source: schema.ledgerEntries.source,
      amount: schema.ledgerEntries.amount,
      currency: schema.ledgerEntries.currency,
      playerId: schema.ledgerEntries.playerId,
      playerEmail: schema.players.email,
      metadata: schema.ledgerEntries.metadata,
      pairId: schema.ledgerEntries.pairId,
    })
    .from(schema.ledgerEntries)
    .leftJoin(schema.players, sql`${schema.players.id} = ${schema.ledgerEntries.playerId}`)
    .where(and(...wheres))
    .orderBy(desc(schema.ledgerEntries.createdAt))
    .limit(limit)

  // Resolve gameId → { name, providerSlug, providerName } in one query.
  const gameIds = Array.from(
    new Set(
      rows
        .map((r) => (r.metadata as { gameId?: string } | null)?.gameId)
        .filter((g): g is string => Boolean(g)),
    ),
  )

  const gameMap = new Map<
    string,
    { name: string; providerSlug: string | null; providerName: string | null }
  >()
  if (gameIds.length > 0) {
    const games = await db
      .select({
        id: schema.games.id,
        name: schema.games.displayName,
        providerSlug: schema.gameProviders.slug,
        providerName: schema.gameProviders.displayName,
      })
      .from(schema.games)
      .leftJoin(schema.gameProviders, sql`${schema.gameProviders.id} = ${schema.games.providerId}`)
      .where(inArray(schema.games.id, gameIds))
    for (const g of games) {
      gameMap.set(g.id, {
        name: g.name,
        providerSlug: g.providerSlug,
        providerName: g.providerName,
      })
    }
  }

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as { gameId?: string; roundId?: string }
    const game = meta.gameId ? gameMap.get(meta.gameId) : null
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      source: r.source as 'bet' | 'win',
      amount: r.amount,
      currency: r.currency as 'GC' | 'SC',
      playerId: r.playerId,
      playerEmail: r.playerEmail,
      gameId: meta.gameId ?? null,
      gameName: game?.name ?? null,
      providerSlug: game?.providerSlug ?? null,
      providerName: game?.providerName ?? null,
      roundId: meta.roundId ?? null,
      pairId: r.pairId,
    }
  })
}

export interface CasinoActivityInsights {
  betEvents: number
  winEvents: number
  scWagered: bigint
  scWon: bigint
  gcWagered: bigint
  gcWon: bigint
  /** GGR = bets - wins (in SC, the only currency that produces real GGR). */
  ggrSc: bigint
  /** RTP = wins / bets across SC. */
  rtpPct: number | null
  uniquePlayers: number
}

/** Insights are computed over the **same** filters as the list — so the tiles
 * always reflect the data the operator is looking at. */
export async function fetchCasinoActivityInsights(
  filters: CasinoActivityFilters,
): Promise<CasinoActivityInsights> {
  const db = getDb()
  const wheres: ReturnType<typeof eq>[] = []
  if (filters.type === 'bet') wheres.push(eq(schema.ledgerEntries.source, 'bet'))
  else if (filters.type === 'win') wheres.push(eq(schema.ledgerEntries.source, 'win'))
  else wheres.push(inArray(schema.ledgerEntries.source, ['bet', 'win']))

  if (filters.currency === 'SC' || filters.currency === 'GC') {
    wheres.push(eq(schema.ledgerEntries.currency, filters.currency))
  }

  const range = mergeDateRange({ quick: filters.quick, from: filters.from, to: filters.to })
  if (range.from) wheres.push(gte(schema.ledgerEntries.createdAt, range.from))
  if (range.to) wheres.push(lte(schema.ledgerEntries.createdAt, range.to))

  const minAmount = parseAmountFilter(filters.minAmount)
  const maxAmount = parseAmountFilter(filters.maxAmount)
  if (minAmount !== null) wheres.push(gte(schema.ledgerEntries.amount, minAmount))
  if (maxAmount !== null) wheres.push(lte(schema.ledgerEntries.amount, maxAmount))

  if (filters.providerSlug && filters.providerSlug !== 'all') {
    const games = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .leftJoin(schema.gameProviders, sql`${schema.gameProviders.id} = ${schema.games.providerId}`)
      .where(eq(schema.gameProviders.slug, filters.providerSlug))
    const gameIds = games.map((g) => g.id)
    if (gameIds.length === 0) {
      return {
        betEvents: 0,
        winEvents: 0,
        scWagered: 0n,
        scWon: 0n,
        gcWagered: 0n,
        gcWon: 0n,
        ggrSc: 0n,
        rtpPct: null,
        uniquePlayers: 0,
      }
    }
    wheres.push(
      sql`(${schema.ledgerEntries.metadata} ->> 'gameId') = ANY(ARRAY[${sql.join(
        gameIds.map((id) => sql`${id}`),
        sql`, `,
      )}])`,
    )
  }

  const [agg] = await db
    .select({
      betEvents: sql<string>`COUNT(*) FILTER (WHERE ${schema.ledgerEntries.source} = 'bet')::text`,
      winEvents: sql<string>`COUNT(*) FILTER (WHERE ${schema.ledgerEntries.source} = 'win')::text`,
      scWagered: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}) FILTER (WHERE ${schema.ledgerEntries.source} = 'bet' AND ${schema.ledgerEntries.currency} = 'SC'), 0)::text`,
      scWon: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}) FILTER (WHERE ${schema.ledgerEntries.source} = 'win' AND ${schema.ledgerEntries.currency} = 'SC'), 0)::text`,
      gcWagered: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}) FILTER (WHERE ${schema.ledgerEntries.source} = 'bet' AND ${schema.ledgerEntries.currency} = 'GC'), 0)::text`,
      gcWon: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}) FILTER (WHERE ${schema.ledgerEntries.source} = 'win' AND ${schema.ledgerEntries.currency} = 'GC'), 0)::text`,
      uniquePlayers: sql<string>`COUNT(DISTINCT ${schema.ledgerEntries.playerId})::text`,
    })
    .from(schema.ledgerEntries)
    .where(and(...wheres))

  const scWagered = BigInt(agg?.scWagered ?? '0')
  const scWon = BigInt(agg?.scWon ?? '0')
  const ggrSc = scWagered - scWon

  return {
    betEvents: Number(agg?.betEvents ?? '0'),
    winEvents: Number(agg?.winEvents ?? '0'),
    scWagered,
    scWon,
    gcWagered: BigInt(agg?.gcWagered ?? '0'),
    gcWon: BigInt(agg?.gcWon ?? '0'),
    ggrSc,
    rtpPct: scWagered > 0n ? (Number(scWon) / Number(scWagered)) * 100 : null,
    uniquePlayers: Number(agg?.uniquePlayers ?? '0'),
  }
}

/** List of providers that have at least one game — for the filter dropdown. */
export async function fetchProviderOptions(): Promise<{ slug: string; name: string }[]> {
  const db = getDb()
  const rows = await db
    .select({
      slug: schema.gameProviders.slug,
      name: schema.gameProviders.displayName,
    })
    .from(schema.gameProviders)
    .orderBy(asc(schema.gameProviders.displayName))
  return rows
    .filter((r): r is { slug: string; name: string } => Boolean(r.slug))
    .map((r) => ({ slug: r.slug, name: r.name }))
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
