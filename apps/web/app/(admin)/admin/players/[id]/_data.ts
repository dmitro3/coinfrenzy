import 'server-only'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// Parse a Postgres numeric(20,4) text representation (e.g. "5.0000" or "0") to
// a bigint expressed in minor units (multiplied by 10_000). BigInt() alone
// throws on any string containing a decimal point, so SQL `::text` casts of
// numeric sums must be normalised here. Returns 0n for null/undefined/'0'.
function numericTextToMinor(s: string | null | undefined): bigint {
  if (!s) return 0n
  const negative = s.startsWith('-')
  const abs = negative ? s.slice(1) : s
  const [maj = '0', frac = ''] = abs.split('.')
  const fracPad = (frac + '0000').slice(0, 4)
  const v = BigInt(maj) * 10_000n + BigInt(fracPad || '0')
  return negative ? -v : v
}

export interface MessageTemplateRow {
  id: string
  slug: string
  displayName: string
  category: string | null
}

/**
 * Pull current email + SMS templates so the player-detail SendMessage modal
 * can populate its picker without an extra round-trip from the client.
 */
export async function fetchMessageTemplates(): Promise<{
  email: MessageTemplateRow[]
  sms: MessageTemplateRow[]
}> {
  const db = getDb()
  const [email, sms] = await Promise.all([
    db
      .select({
        id: schema.emailTemplates.id,
        slug: schema.emailTemplates.slug,
        displayName: schema.emailTemplates.displayName,
        category: schema.emailTemplates.category,
      })
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.isCurrent, true)),
    db
      .select({
        id: schema.smsTemplates.id,
        slug: schema.smsTemplates.slug,
        displayName: schema.smsTemplates.displayName,
        category: schema.smsTemplates.category,
      })
      .from(schema.smsTemplates)
      .where(eq(schema.smsTemplates.isCurrent, true)),
  ])
  return { email, sms }
}

export interface PlayerDetail {
  id: string
  email: string
  username: string | null
  displayName: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  state: string | null
  signupState: string | null
  status: string
  statusReason: string | null
  /** True when an admin has engaged a stealth lock (login silently fails). */
  stealthLocked: boolean
  stealthLockReason: string | null
  stealthLockedAt: string | null
  kycLevel: number
  kycVerifiedAt: string | null
  emailConsent: boolean
  smsConsent: boolean
  twoFactorEnabled: boolean
  rgSelfExcludedUntil: string | null
  rgDepositLimitDaily: bigint | null
  rgDepositLimitWeekly: bigint | null
  rgDepositLimitMonthly: bigint | null
  firstSeenAt: string
  lastSeenAt: string | null
  lastLoginAt: string | null

  walletGc: WalletDetail
  walletSc: WalletDetail

  lifetime: {
    totalDepositedUsd: bigint
    totalRedeemedUsd: bigint
    netPositionUsd: bigint
    purchaseCount: number
    redemptionCount: number
    pendingRedemptionCount: number
    totalWageredSc: bigint
    totalWonSc: bigint
    ggrSc: bigint
    ngrSc: bigint
    daysActive: number
  } | null

  vip: {
    status: 'none' | 'candidate' | 'vip' | 'high_roller'
    qualifiedAt: string | null
    assignedHostId: string | null
    hostAssignedAt: string | null
    hostDisplayName: string | null
    hostEmail: string | null
  }
}

export interface WalletDetail {
  currency: 'GC' | 'SC'
  currentBalance: bigint
  balancePurchased: bigint
  balanceBonus: bigint
  balancePromo: bigint
  balanceEarned: bigint
}

export async function fetchPlayerDetail(playerId: string): Promise<PlayerDetail | null> {
  const db = getDb()
  const [player] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  if (!player) return null

  const [authRow] = await db
    .select({ twoFactorEnabled: schema.authUser.twoFactorEnabled })
    .from(schema.authUser)
    .where(eq(schema.authUser.id, playerId))
    .limit(1)

  const wallets = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.playerId, playerId))

  const [stats] = await db
    .select()
    .from(schema.playerLifetimeStats)
    .where(eq(schema.playerLifetimeStats.playerId, playerId))
    .limit(1)

  const walletGc = wallets.find((w) => w.currency === 'GC') ?? emptyWallet('GC')
  const walletSc = wallets.find((w) => w.currency === 'SC') ?? emptyWallet('SC')

  let hostDisplayName: string | null = null
  let hostEmail: string | null = null
  if (player.assignedHostId) {
    const [host] = await db
      .select({
        displayName: schema.admins.displayName,
        email: schema.admins.email,
      })
      .from(schema.admins)
      .where(eq(schema.admins.id, player.assignedHostId))
      .limit(1)
    if (host) {
      hostDisplayName = host.displayName
      hostEmail = host.email
    }
  }

  const metadata = (player.metadata ?? {}) as Record<string, unknown>
  const stealth = metadata.stealth_lock as { locked_at?: string; reason?: string } | undefined

  return {
    id: player.id,
    email: player.email,
    username: player.username,
    displayName: player.displayName,
    firstName: player.firstName,
    lastName: player.lastName,
    phone: player.phone,
    state: player.state,
    signupState: player.signupState,
    status: player.status,
    statusReason: player.statusReason,
    stealthLocked: Boolean(stealth?.locked_at),
    stealthLockReason: stealth?.reason ?? null,
    stealthLockedAt: stealth?.locked_at ?? null,
    kycLevel: player.kycLevel,
    kycVerifiedAt: player.kycVerifiedAt?.toISOString() ?? null,
    emailConsent: player.emailConsent,
    smsConsent: player.smsConsent,
    twoFactorEnabled: authRow?.twoFactorEnabled ?? false,
    rgSelfExcludedUntil: player.rgSelfExcludedUntil?.toISOString() ?? null,
    rgDepositLimitDaily: player.rgDepositLimitDaily ?? null,
    rgDepositLimitWeekly: player.rgDepositLimitWeekly ?? null,
    rgDepositLimitMonthly: player.rgDepositLimitMonthly ?? null,
    firstSeenAt: player.firstSeenAt.toISOString(),
    lastSeenAt: player.lastSeenAt?.toISOString() ?? null,
    lastLoginAt: player.lastLoginAt?.toISOString() ?? null,

    walletGc: walletToDetail(walletGc),
    walletSc: walletToDetail(walletSc),

    lifetime: stats
      ? {
          totalDepositedUsd: stats.totalDepositedUsd,
          totalRedeemedUsd: stats.totalRedeemedUsd,
          netPositionUsd: stats.netPositionUsd,
          purchaseCount: stats.purchaseCount,
          redemptionCount: stats.redemptionCount,
          pendingRedemptionCount: stats.pendingRedemptionCount,
          totalWageredSc: stats.totalWageredSc,
          totalWonSc: stats.totalWonSc,
          ggrSc: stats.ggrSc,
          ngrSc: stats.ngrSc,
          daysActive: stats.daysActive,
        }
      : null,

    vip: {
      status: (player.vipStatus ?? 'none') as 'none' | 'candidate' | 'vip' | 'high_roller',
      qualifiedAt: player.vipQualifiedAt?.toISOString() ?? null,
      assignedHostId: player.assignedHostId ?? null,
      hostAssignedAt: player.hostAssignedAt?.toISOString() ?? null,
      hostDisplayName,
      hostEmail,
    },
  }
}

export interface PurchaseRow {
  id: string
  amountUsd: bigint
  baseGc: bigint
  baseSc: bigint
  bonusGc: bigint
  bonusSc: bigint
  status: string
  cardBrand: string | null
  cardLast4: string | null
  createdAt: string
}

export async function fetchPlayerPurchases(playerId: string, limit = 10): Promise<PurchaseRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.purchases.id,
      amountUsd: schema.purchases.amountUsd,
      baseGc: schema.purchases.baseGc,
      baseSc: schema.purchases.baseSc,
      bonusGc: schema.purchases.bonusGc,
      bonusSc: schema.purchases.bonusSc,
      status: schema.purchases.status,
      cardBrand: schema.purchases.finixCardBrand,
      cardLast4: schema.purchases.finixCardLast4,
      createdAt: schema.purchases.createdAt,
    })
    .from(schema.purchases)
    .where(eq(schema.purchases.playerId, playerId))
    .orderBy(desc(schema.purchases.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    amountUsd: r.amountUsd,
    baseGc: r.baseGc,
    baseSc: r.baseSc,
    bonusGc: r.bonusGc,
    bonusSc: r.bonusSc,
    status: r.status,
    cardBrand: r.cardBrand,
    cardLast4: r.cardLast4,
    createdAt: r.createdAt.toISOString(),
  }))
}

export interface RedemptionRow {
  id: string
  amountUsd: bigint
  amountSc: bigint
  method: string
  status: string
  createdAt: string
  paidAt: string | null
}

export async function fetchPlayerRedemptions(
  playerId: string,
  limit = 10,
): Promise<RedemptionRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.redemptions.id,
      amountUsd: schema.redemptions.amountUsd,
      amountSc: schema.redemptions.amountSc,
      method: schema.redemptions.method,
      status: schema.redemptions.status,
      createdAt: schema.redemptions.createdAt,
      paidAt: schema.redemptions.paidAt,
    })
    .from(schema.redemptions)
    .where(eq(schema.redemptions.playerId, playerId))
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    amountUsd: r.amountUsd,
    amountSc: r.amountSc,
    method: r.method,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
  }))
}

export interface BonusAwardedRow {
  id: string
  bonusName: string
  bonusType: string
  scAmount: bigint
  gcAmount: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
  playthroughComplete: boolean
  status: string
  expiresAt: string | null
  createdAt: string
}

export async function fetchPlayerBonuses(playerId: string, limit = 25): Promise<BonusAwardedRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.bonusesAwarded.id,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      scAmount: schema.bonusesAwarded.scAmount,
      gcAmount: schema.bonusesAwarded.gcAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      playthroughComplete: schema.bonusesAwarded.playthroughComplete,
      status: schema.bonusesAwarded.status,
      expiresAt: schema.bonusesAwarded.expiresAt,
      createdAt: schema.bonusesAwarded.createdAt,
    })
    .from(schema.bonusesAwarded)
    .leftJoin(schema.bonuses, eq(schema.bonusesAwarded.bonusId, schema.bonuses.id))
    .where(eq(schema.bonusesAwarded.playerId, playerId))
    .orderBy(desc(schema.bonusesAwarded.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    bonusName: r.bonusName ?? 'Unknown bonus',
    bonusType: String(r.bonusType ?? 'unknown'),
    scAmount: r.scAmount,
    gcAmount: r.gcAmount,
    playthroughRequired: r.playthroughRequired,
    playthroughProgress: r.playthroughProgress,
    playthroughComplete: r.playthroughComplete,
    status: r.status,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export interface ActivityRow {
  id: string
  eventName: string
  eventCategory: string
  amount: bigint | null
  currency: string | null
  createdAt: string
}

export async function fetchPlayerActivity(playerId: string, limit = 25): Promise<ActivityRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.playerEvents.id,
      eventName: schema.playerEvents.eventName,
      eventCategory: schema.playerEvents.eventCategory,
      amount: schema.playerEvents.amount,
      currency: schema.playerEvents.currency,
      createdAt: schema.playerEvents.createdAt,
    })
    .from(schema.playerEvents)
    .where(eq(schema.playerEvents.playerId, playerId))
    .orderBy(desc(schema.playerEvents.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    eventName: r.eventName,
    eventCategory: r.eventCategory,
    amount: r.amount ?? null,
    currency: r.currency ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export interface SessionRow {
  id: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
}

export async function fetchPlayerSessions(playerId: string): Promise<SessionRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.authSession.id,
      ip: schema.authSession.ipAddress,
      userAgent: schema.authSession.userAgent,
      createdAt: schema.authSession.createdAt,
      expiresAt: schema.authSession.expiresAt,
    })
    .from(schema.authSession)
    .where(eq(schema.authSession.userId, playerId))
    .orderBy(desc(schema.authSession.createdAt))
    .limit(50)
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }))
}

export interface AuditRow {
  id: string
  action: string
  actorId: string | null
  actorRole: string | null
  reason: string | null
  occurredAt: string
  metadata: Record<string, unknown> | null
}

export async function fetchPlayerAuditEntries(playerId: string, limit = 100): Promise<AuditRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      actorRole: schema.auditLog.actorRole,
      reason: schema.auditLog.reason,
      occurredAt: schema.auditLog.occurredAt,
      metadata: schema.auditLog.metadata,
    })
    .from(schema.auditLog)
    .where(
      and(eq(schema.auditLog.resourceKind, 'player'), eq(schema.auditLog.resourceId, playerId)),
    )
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorId: r.actorId,
    actorRole: r.actorRole,
    reason: r.reason,
    occurredAt: r.occurredAt.toISOString(),
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }))
}

export interface NoteRow {
  id: string
  occurredAt: string
  actorId: string | null
  actorRole: string | null
  note: string
}

export async function fetchPlayerNotes(playerId: string): Promise<NoteRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.auditLog.id,
      occurredAt: schema.auditLog.occurredAt,
      actorId: schema.auditLog.actorId,
      actorRole: schema.auditLog.actorRole,
      metadata: schema.auditLog.metadata,
    })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, 'player.note'), eq(schema.auditLog.resourceId, playerId)))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(100)
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt.toISOString(),
    actorId: r.actorId,
    actorRole: r.actorRole,
    note: (r.metadata as { note?: string } | null)?.note ?? '',
  }))
}

/* -------------------------------------------------------------------------- */
/* Player Insights (top games, top providers, recent big wins)                 */
/* -------------------------------------------------------------------------- */

export interface TopGameRow {
  gameId: string
  gameName: string
  playCount: number
  ggrSc: bigint
}

export interface TopProviderRow {
  providerId: string
  providerName: string
  betCount: number
  scWagered: bigint
}

export interface BigWinRow {
  id: string
  gameName: string | null
  amountSc: bigint
  occurredAt: string
}

/**
 * Top 3 games this player has played by bet count, scoped to SC bets — and
 * the GGR contribution (bets - wins) attributable to that game so the panel
 * can sort plays by economic impact in a future iteration.
 */
export async function fetchPlayerTopGames(playerId: string, limit = 3): Promise<TopGameRow[]> {
  const db = getDb()
  const rows = (await db.execute(sql`
    SELECT
      (le.metadata->>'gameId') AS game_id,
      COUNT(*) FILTER (WHERE le.source = 'bet')::int AS play_count,
      COALESCE(SUM(CASE WHEN le.source = 'bet' THEN le.amount ELSE -le.amount END), 0)::text AS ggr
    FROM ledger_entries le
    WHERE le.player_id = ${playerId}
      AND le.source IN ('bet', 'win')
      AND le.currency = 'SC'
      AND (le.metadata->>'gameId') IS NOT NULL
    GROUP BY (le.metadata->>'gameId')
    HAVING COUNT(*) FILTER (WHERE le.source = 'bet') > 0
    ORDER BY play_count DESC
    LIMIT ${limit}
  `)) as unknown as Array<{ game_id: string; play_count: number; ggr: string }>

  if (rows.length === 0) return []

  const gameIds = rows.map((r) => r.game_id)
  const gameRows = await db
    .select({ id: schema.games.id, name: schema.games.displayName })
    .from(schema.games)
    .where(inArray(schema.games.id, gameIds))
  const nameMap = new Map(gameRows.map((g) => [g.id, g.name]))

  return rows.map((r) => ({
    gameId: r.game_id,
    gameName: nameMap.get(r.game_id) ?? 'Unknown game',
    playCount: r.play_count,
    ggrSc: numericTextToMinor(r.ggr),
  }))
}

/**
 * Top 3 providers by bet count for this player. Uses the same metadata key
 * (`gameId`) as the game lookup, then joins through `games` →
 * `game_providers` to aggregate per provider.
 */
export async function fetchPlayerTopProviders(
  playerId: string,
  limit = 3,
): Promise<TopProviderRow[]> {
  const db = getDb()
  const rows = (await db.execute(sql`
    SELECT
      gp.id::text AS provider_id,
      gp.display_name AS provider_name,
      COUNT(le.*)::int AS bet_count,
      COALESCE(SUM(le.amount), 0)::text AS sc_wagered
    FROM ledger_entries le
    JOIN games g ON g.id::text = le.metadata->>'gameId'
    JOIN game_providers gp ON gp.id = g.provider_id
    WHERE le.player_id = ${playerId}
      AND le.source = 'bet'
      AND le.currency = 'SC'
    GROUP BY gp.id, gp.display_name
    ORDER BY bet_count DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    provider_id: string
    provider_name: string
    bet_count: number
    sc_wagered: string
  }>

  return rows.map((r) => ({
    providerId: r.provider_id,
    providerName: r.provider_name,
    betCount: r.bet_count,
    scWagered: numericTextToMinor(r.sc_wagered),
  }))
}

/**
 * Recent SC wins above the `thresholdSc` floor. Falls back to the top 3
 * wins lifetime when no recent wins clear the bar — matches the spec
 * ("last 3 wins where win_amount > 100 SC OR top 3 wins lifetime if none
 * recent").
 */
export async function fetchPlayerBigWins(
  playerId: string,
  thresholdSc = 100n * 10_000n,
  limit = 3,
): Promise<BigWinRow[]> {
  const db = getDb()
  const recent = await db
    .select({
      id: schema.ledgerEntries.id,
      amount: schema.ledgerEntries.amount,
      createdAt: schema.ledgerEntries.createdAt,
      metadata: schema.ledgerEntries.metadata,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.playerId, playerId),
        eq(schema.ledgerEntries.source, 'win'),
        eq(schema.ledgerEntries.currency, 'SC'),
        sql`${schema.ledgerEntries.amount} >= ${thresholdSc.toString()}`,
      ),
    )
    .orderBy(desc(schema.ledgerEntries.createdAt))
    .limit(limit)

  let entries = recent
  if (entries.length === 0) {
    entries = await db
      .select({
        id: schema.ledgerEntries.id,
        amount: schema.ledgerEntries.amount,
        createdAt: schema.ledgerEntries.createdAt,
        metadata: schema.ledgerEntries.metadata,
      })
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.playerId, playerId),
          eq(schema.ledgerEntries.source, 'win'),
          eq(schema.ledgerEntries.currency, 'SC'),
        ),
      )
      .orderBy(desc(schema.ledgerEntries.amount))
      .limit(limit)
  }

  if (entries.length === 0) return []

  const gameIds = Array.from(
    new Set(
      entries
        .map((e) => (e.metadata as { gameId?: string } | null)?.gameId)
        .filter((g): g is string => Boolean(g)),
    ),
  )
  const nameMap = new Map<string, string>()
  if (gameIds.length > 0) {
    const games = await db
      .select({ id: schema.games.id, name: schema.games.displayName })
      .from(schema.games)
      .where(inArray(schema.games.id, gameIds))
    for (const g of games) nameMap.set(g.id, g.name)
  }

  return entries.map((e) => {
    const meta = (e.metadata ?? {}) as { gameId?: string }
    return {
      id: e.id,
      gameName: meta.gameId ? (nameMap.get(meta.gameId) ?? null) : null,
      amountSc: e.amount,
      occurredAt: e.createdAt.toISOString(),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Game Activity (bet/win ledger entries)                                     */
/* -------------------------------------------------------------------------- */

export interface GameActivityRow {
  id: string
  pairId: string
  source: 'bet' | 'win'
  amount: bigint
  currency: 'GC' | 'SC'
  createdAt: string
  gameId: string | null
  gameName: string | null
  providerName: string | null
  roundId: string | null
  sessionId: string | null
}

export interface GameActivitySummary {
  totalBets: number
  totalWins: number
  scWagered: bigint
  scWon: bigint
  netSc: bigint
  favoriteGame: { name: string; plays: number } | null
}

export async function fetchPlayerGameActivity(
  playerId: string,
  limit = 100,
): Promise<{ rows: GameActivityRow[]; summary: GameActivitySummary }> {
  const db = getDb()

  const entries = await db
    .select({
      id: schema.ledgerEntries.id,
      pairId: schema.ledgerEntries.pairId,
      source: schema.ledgerEntries.source,
      amount: schema.ledgerEntries.amount,
      currency: schema.ledgerEntries.currency,
      createdAt: schema.ledgerEntries.createdAt,
      metadata: schema.ledgerEntries.metadata,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.playerId, playerId),
        inArray(schema.ledgerEntries.source, ['bet', 'win']),
      ),
    )
    .orderBy(desc(schema.ledgerEntries.createdAt))
    .limit(limit)

  // Resolve game IDs found in metadata to game name + provider
  const gameIds = Array.from(
    new Set(
      entries
        .map((e) => (e.metadata as { gameId?: string } | null)?.gameId)
        .filter((g): g is string => Boolean(g)),
    ),
  )

  const gameMap = new Map<string, { name: string; provider: string | null }>()
  if (gameIds.length > 0) {
    const games = await db
      .select({
        id: schema.games.id,
        name: schema.games.displayName,
        provider: schema.gameProviders.displayName,
      })
      .from(schema.games)
      .leftJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
      .where(inArray(schema.games.id, gameIds))
    for (const g of games) gameMap.set(g.id, { name: g.name, provider: g.provider })
  }

  const rows: GameActivityRow[] = entries.map((e) => {
    const meta = (e.metadata ?? {}) as {
      gameId?: string
      roundId?: string
      sessionId?: string
    }
    const game = meta.gameId ? gameMap.get(meta.gameId) : null
    return {
      id: e.id,
      pairId: e.pairId,
      source: e.source as 'bet' | 'win',
      amount: e.amount,
      currency: e.currency as 'GC' | 'SC',
      createdAt: e.createdAt.toISOString(),
      gameId: meta.gameId ?? null,
      gameName: game?.name ?? null,
      providerName: game?.provider ?? null,
      roundId: meta.roundId ?? null,
      sessionId: meta.sessionId ?? null,
    }
  })

  // Summary aggregates over a wider window (lifetime) — separate query for
  // accuracy beyond the LIMIT N preview.
  const [summaryRow] = (await db.execute(sql`
    SELECT
      coalesce(sum(case when source = 'bet' then 1 else 0 end), 0)::int AS total_bets,
      coalesce(sum(case when source = 'win' then 1 else 0 end), 0)::int AS total_wins,
      coalesce(sum(case when source = 'bet' and currency = 'SC' then amount else 0 end), 0)::text AS sc_wagered,
      coalesce(sum(case when source = 'win' and currency = 'SC' then amount else 0 end), 0)::text AS sc_won
    FROM ledger_entries
    WHERE player_id = ${playerId}
      AND source IN ('bet', 'win')
  `)) as unknown as Array<{
    total_bets: number
    total_wins: number
    sc_wagered: string
    sc_won: string
  }>

  // Favourite game by play count (within the previewed rows; good enough for
  // the QuickInsights tile)
  const playCounts = new Map<string, { name: string; n: number }>()
  for (const r of rows) {
    if (r.source !== 'bet' || !r.gameName) continue
    const cur = playCounts.get(r.gameName) ?? { name: r.gameName, n: 0 }
    cur.n++
    playCounts.set(r.gameName, cur)
  }
  const favorite = [...playCounts.values()].sort((a, b) => b.n - a.n)[0] ?? null

  const scWagered = numericTextToMinor(summaryRow?.sc_wagered)
  const scWon = numericTextToMinor(summaryRow?.sc_won)

  return {
    rows,
    summary: {
      totalBets: summaryRow?.total_bets ?? 0,
      totalWins: summaryRow?.total_wins ?? 0,
      scWagered,
      scWon,
      netSc: scWon - scWagered,
      favoriteGame: favorite ? { name: favorite.name, plays: favorite.n } : null,
    },
  }
}

function emptyWallet(currency: 'GC' | 'SC'): {
  currency: 'GC' | 'SC'
  currentBalance: bigint
  balancePurchased: bigint
  balanceBonus: bigint
  balancePromo: bigint
  balanceEarned: bigint
} {
  return {
    currency,
    currentBalance: 0n,
    balancePurchased: 0n,
    balanceBonus: 0n,
    balancePromo: 0n,
    balanceEarned: 0n,
  }
}

function walletToDetail(w: {
  currency: string
  currentBalance: bigint
  balancePurchased: bigint
  balanceBonus: bigint
  balancePromo: bigint
  balanceEarned: bigint
}): WalletDetail {
  return {
    currency: w.currency as 'GC' | 'SC',
    currentBalance: w.currentBalance,
    balancePurchased: w.balancePurchased,
    balanceBonus: w.balanceBonus,
    balancePromo: w.balancePromo,
    balanceEarned: w.balanceEarned,
  }
}
