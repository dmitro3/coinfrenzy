import 'server-only'

import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'

// docs/08 §7 — server data loaders for the cashier admin pages.

export interface RedemptionListRow {
  id: string
  status: string
  amountSc: bigint
  amountUsd: bigint
  method: string
  paymentInstrumentId: string | null
  finixTransferId: string | null
  rejectionReason: string | null
  rejectionCategory: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  paidAt: Date | null
  submittedToFinixAt: Date | null
  requestedAt: Date
  createdAt: Date
  player: {
    id: string
    email: string
    displayName: string | null
    state: string | null
    kycLevel: number
    status: string
  }
}

export async function listRedemptionsByStatuses(
  statuses: string[],
  limit = 200,
): Promise<RedemptionListRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.redemptions.id,
      status: schema.redemptions.status,
      amountSc: schema.redemptions.amountSc,
      amountUsd: schema.redemptions.amountUsd,
      method: schema.redemptions.method,
      paymentInstrumentId: schema.redemptions.paymentInstrumentId,
      finixTransferId: schema.redemptions.finixTransferId,
      rejectionReason: schema.redemptions.rejectionReason,
      rejectionCategory: schema.redemptions.rejectionCategory,
      approvedAt: schema.redemptions.approvedAt,
      rejectedAt: schema.redemptions.rejectedAt,
      paidAt: schema.redemptions.paidAt,
      submittedToFinixAt: schema.redemptions.submittedToFinixAt,
      requestedAt: schema.redemptions.requestedAt,
      createdAt: schema.redemptions.createdAt,
      playerId: schema.players.id,
      playerEmail: schema.players.email,
      playerDisplayName: schema.players.displayName,
      playerState: schema.players.state,
      playerKycLevel: schema.players.kycLevel,
      playerStatus: schema.players.status,
    })
    .from(schema.redemptions)
    .innerJoin(schema.players, eq(schema.players.id, schema.redemptions.playerId))
    .where(inArray(schema.redemptions.status, statuses))
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    amountSc: row.amountSc,
    amountUsd: row.amountUsd,
    method: row.method,
    paymentInstrumentId: row.paymentInstrumentId,
    finixTransferId: row.finixTransferId,
    rejectionReason: row.rejectionReason,
    rejectionCategory: row.rejectionCategory,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
    paidAt: row.paidAt,
    submittedToFinixAt: row.submittedToFinixAt,
    requestedAt: row.requestedAt,
    createdAt: row.createdAt,
    player: {
      id: row.playerId,
      email: row.playerEmail,
      displayName: row.playerDisplayName,
      state: row.playerState,
      kycLevel: row.playerKycLevel,
      status: row.playerStatus,
    },
  }))
}

export interface RedemptionDetail extends RedemptionListRow {
  drainPlan: { bucket: string; amount: string }[]
  paymentInstrument: {
    bankName: string | null
    accountLast4: string | null
    cardLast4: string | null
    cardBrand: string | null
  } | null
  recentPurchases: { id: string; amountUsd: bigint; createdAt: Date; status: string }[]
  redemptionHistory: { id: string; amountUsd: bigint; status: string; createdAt: Date }[]
  complianceFlags: { id: string; flagType: string; severity: string; reason: string }[]
  geoSamples: {
    id: string
    state: string | null
    country: string | null
    isProxy: boolean | null
    isVpn: boolean | null
    createdAt: Date
  }[]
  kyc: {
    footprintStatus: string | null
    watchlistLastStatus: string | null
    watchlistLastCheckAt: Date | null
  } | null
  walletSnapshot: {
    purchased: bigint
    earned: bigint
    promo: bigint
    bonus: bigint
    total: bigint
    redeemable: bigint
  } | null
  /**
   * The headline numbers we surface above the fold on the right pane.
   * Everything here is denominated in USD minor units (numeric(20,4)).
   * NGR is presented as `ngrSc` because the lifetime stats roll-up uses
   * SC (1 SC ≡ $1 at payout time, see docs/04 §3.4).
   */
  playerKpi: {
    ngrSc: bigint
    ngrLifetimeUsd: bigint
    ngr30dSc: bigint
    totalDepositedUsd: bigint
    totalRedeemedUsd: bigint
    netPositionUsd: bigint
    redeemed30dUsd: bigint
    wagered30dSc: bigint
    deposited30dUsd: bigint
    purchaseCount: number
    redemptionCount: number
    pendingRedemptionCount: number
    daysActive: number
    lastRedeemAt: Date | null
    lastPaidRedeemAt: Date | null
    lastPurchaseAt: Date | null
    accountAgeDays: number
  }
}

export async function loadRedemptionDetail(redemptionId: string): Promise<RedemptionDetail | null> {
  const db = getDb()
  const baseRows = await db
    .select()
    .from(schema.redemptions)
    .innerJoin(schema.players, eq(schema.players.id, schema.redemptions.playerId))
    .where(eq(schema.redemptions.id, redemptionId))
    .limit(1)
  const found = baseRows[0]
  if (!found) return null
  const r = found.redemptions
  const p = found.players

  const inst = r.paymentInstrumentId
    ? ((
        await db
          .select({
            bankName: schema.paymentInstruments.bankName,
            accountLast4: schema.paymentInstruments.accountLast4,
            cardLast4: schema.paymentInstruments.cardLast4,
            cardBrand: schema.paymentInstruments.cardBrand,
          })
          .from(schema.paymentInstruments)
          .where(eq(schema.paymentInstruments.id, r.paymentInstrumentId))
          .limit(1)
      )[0] ?? null)
    : null

  const purchases = await db
    .select({
      id: schema.purchases.id,
      amountUsd: schema.purchases.amountUsd,
      status: schema.purchases.status,
      createdAt: schema.purchases.createdAt,
    })
    .from(schema.purchases)
    .where(eq(schema.purchases.playerId, p.id))
    .orderBy(desc(schema.purchases.createdAt))
    .limit(10)

  const history = await db
    .select({
      id: schema.redemptions.id,
      amountUsd: schema.redemptions.amountUsd,
      status: schema.redemptions.status,
      createdAt: schema.redemptions.createdAt,
    })
    .from(schema.redemptions)
    .where(eq(schema.redemptions.playerId, p.id))
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(20)

  const flags = await db
    .select({
      id: schema.complianceFlags.id,
      flagType: schema.complianceFlags.flagType,
      severity: schema.complianceFlags.severity,
      reason: schema.complianceFlags.reason,
    })
    .from(schema.complianceFlags)
    .where(and(eq(schema.complianceFlags.playerId, p.id), isNull(schema.complianceFlags.clearedAt)))

  const geo = await db
    .select({
      id: schema.geoHistory.id,
      state: schema.geoHistory.state,
      country: schema.geoHistory.country,
      isProxy: schema.geoHistory.isProxy,
      isVpn: sql<boolean>`false`.as('is_vpn'),
      createdAt: schema.geoHistory.createdAt,
    })
    .from(schema.geoHistory)
    .where(eq(schema.geoHistory.playerId, p.id))
    .orderBy(desc(schema.geoHistory.createdAt))
    .limit(5)

  const kycRows = await db
    .select({
      footprintStatus: schema.kycStatus.footprintStatus,
      watchlistLastStatus: schema.kycStatus.watchlistLastStatus,
      watchlistLastCheckAt: schema.kycStatus.watchlistLastCheckAt,
    })
    .from(schema.kycStatus)
    .where(eq(schema.kycStatus.playerId, p.id))
    .limit(1)

  const walletRows = await db
    .select({
      balancePurchased: schema.wallets.balancePurchased,
      balanceEarned: schema.wallets.balanceEarned,
      balancePromo: schema.wallets.balancePromo,
      balanceBonus: schema.wallets.balanceBonus,
      currentBalance: schema.wallets.currentBalance,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, p.id), eq(schema.wallets.currency, 'SC')))
    .limit(1)
  const wallet = walletRows[0]
  const walletSnapshot = wallet
    ? {
        purchased: wallet.balancePurchased,
        earned: wallet.balanceEarned,
        promo: wallet.balancePromo,
        bonus: wallet.balanceBonus,
        total: wallet.currentBalance,
        redeemable: wallet.balancePurchased + wallet.balanceEarned,
      }
    : null

  // docs/03 §8.2 / §8.3 — the lifetime/30d roll-ups give us NGR, rolling
  // deposit/redeem amounts, and counts in one shot. They are eventually
  // consistent (recomputed by the worker via Inngest cron) but accurate
  // enough for the cashier's "is this player in the money or losing money"
  // gut-check.
  const [lifetime] = await db
    .select()
    .from(schema.playerLifetimeStats)
    .where(eq(schema.playerLifetimeStats.playerId, p.id))
    .limit(1)
  const [rolling30] = await db
    .select()
    .from(schema.player30dStats)
    .where(eq(schema.player30dStats.playerId, p.id))
    .limit(1)

  // `last_redeem_date` is what gamma displays — define it as the most
  // recent redemption row for the player that isn't the one we're looking
  // at right now. We want the cashier to immediately see "they redeemed
  // 3 days ago" without scrolling the history list.
  const [lastRedeemRow] = await db
    .select({ createdAt: schema.redemptions.createdAt })
    .from(schema.redemptions)
    .where(and(eq(schema.redemptions.playerId, p.id), ne(schema.redemptions.id, redemptionId)))
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(1)
  const [lastPaidRow] = await db
    .select({ paidAt: schema.redemptions.paidAt })
    .from(schema.redemptions)
    .where(and(eq(schema.redemptions.playerId, p.id), eq(schema.redemptions.status, 'paid')))
    .orderBy(desc(schema.redemptions.paidAt))
    .limit(1)

  const playerKpi: RedemptionDetail['playerKpi'] = {
    ngrSc: lifetime?.ngrSc ?? 0n,
    ngrLifetimeUsd: lifetime?.ngrSc ?? 0n,
    ngr30dSc: rolling30?.ngrSc30d ?? 0n,
    totalDepositedUsd: lifetime?.totalDepositedUsd ?? 0n,
    totalRedeemedUsd: lifetime?.totalRedeemedUsd ?? 0n,
    netPositionUsd: lifetime?.netPositionUsd ?? 0n,
    redeemed30dUsd: rolling30?.redeemedUsd30d ?? 0n,
    wagered30dSc: rolling30?.wageredSc30d ?? 0n,
    deposited30dUsd: rolling30?.depositedUsd30d ?? 0n,
    purchaseCount: lifetime?.purchaseCount ?? 0,
    redemptionCount: lifetime?.redemptionCount ?? 0,
    pendingRedemptionCount: lifetime?.pendingRedemptionCount ?? 0,
    daysActive: lifetime?.daysActive ?? 0,
    lastRedeemAt: lastRedeemRow?.createdAt ?? null,
    lastPaidRedeemAt: lastPaidRow?.paidAt ?? null,
    lastPurchaseAt: lifetime?.lastPurchaseAt ?? null,
    accountAgeDays: Math.max(
      0,
      Math.floor((Date.now() - new Date(p.firstSeenAt).getTime()) / 86_400_000),
    ),
  }

  return {
    id: r.id,
    status: r.status,
    amountSc: r.amountSc,
    amountUsd: r.amountUsd,
    method: r.method,
    paymentInstrumentId: r.paymentInstrumentId,
    finixTransferId: r.finixTransferId,
    rejectionReason: r.rejectionReason,
    rejectionCategory: r.rejectionCategory,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    paidAt: r.paidAt,
    submittedToFinixAt: r.submittedToFinixAt,
    requestedAt: r.requestedAt,
    createdAt: r.createdAt,
    drainPlan: Array.isArray(r.drainPlan)
      ? (r.drainPlan as { bucket: string; amount: string }[])
      : [],
    paymentInstrument: inst,
    recentPurchases: purchases,
    redemptionHistory: history,
    complianceFlags: flags,
    geoSamples: geo,
    kyc: kycRows[0] ?? null,
    walletSnapshot,
    playerKpi,
    player: {
      id: p.id,
      email: p.email,
      displayName: p.displayName,
      state: p.state,
      kycLevel: p.kycLevel,
      status: p.status,
    },
  }
}
