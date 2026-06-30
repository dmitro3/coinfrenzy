import { and, eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'
import { write as ledgerWrite } from '../ledger/write'
import { computeRedemptionDrainPlan } from '../ledger/drain-order'
import { buildRedemptionRequest } from '../ledger/transactions/redemption-request'

import { checkRedemptionEligibility } from './eligibility'
import { determineNextStatus, loadRedemption } from './create'
import { rejectRedemption } from './reject'
import type {
  PersistedDrainStep,
  RedemptionMethod,
  RedemptionRecord,
  RedemptionStatus,
} from './types'

// docs/07 §6.4 + §6.5 — when KYC completes (via the validation-token
// exchange OR the async webhook), step every kyc_pending redemption forward.
//
// The redemption row exists but did NOT lock SC at request time (see
// create.ts §3.5). We now:
//   1. Re-run eligibility — state may have shifted.
//   2. Recompute the drain plan against the current wallet.
//   3. Write the redemption_request ledger entries (idempotent on
//      (source='redemption_request', source_id=redemption.id)).
//   4. Determine the next status (auto vs review vs aml_hold) and update.

export interface ProgressResult {
  redemptionId: string
  outcome: 'progressed' | 'rejected' | 'skipped'
  nextStatus?: RedemptionStatus
  reason?: string
}

export async function processPendingRedemptionsAwaitingKyc(
  ctx: Context,
  playerId: string,
): Promise<ProgressResult[]> {
  const pending = await ctx.db
    .select()
    .from(schema.redemptions)
    .where(
      and(eq(schema.redemptions.playerId, playerId), eq(schema.redemptions.status, 'kyc_pending')),
    )

  const results: ProgressResult[] = []
  for (const row of pending) {
    results.push(await progressOne(ctx, row))
  }
  return results
}

async function progressOne(
  ctx: Context,
  row: typeof schema.redemptions.$inferSelect,
): Promise<ProgressResult> {
  const eligibility = await checkRedemptionEligibility(ctx, {
    playerId: row.playerId,
    amountSc: row.amountSc,
    method: row.method as RedemptionMethod,
    paymentInstrumentId: row.paymentInstrumentId,
  })

  if (!eligibility.allowed) {
    // Eligibility now fails for non-KYC reason — reject and notify.
    await rejectRedemption(ctx, {
      redemptionId: row.id,
      reason: `Eligibility failed after KYC: ${eligibility.code}`,
      reasonCategory: 'eligibility',
    })
    return { redemptionId: row.id, outcome: 'rejected', reason: eligibility.code }
  }

  if (eligibility.requiresKyc) {
    // Still short on KYC — likely an EDD escalation. Leave the row as-is so
    // the player can complete EDD; nothing to do this pass.
    return { redemptionId: row.id, outcome: 'skipped', reason: 'still_requires_kyc' }
  }

  // Recompute drain against fresh wallet. (Bucket composition may have
  // moved since the original request.)
  const walletRows = await ctx.db
    .select({
      balancePurchased: schema.wallets.balancePurchased,
      balanceBonus: schema.wallets.balanceBonus,
      balancePromo: schema.wallets.balancePromo,
      balanceEarned: schema.wallets.balanceEarned,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, row.playerId), eq(schema.wallets.currency, 'SC')))
    .limit(1)
  const wallet = walletRows[0]
  if (!wallet) {
    await rejectRedemption(ctx, {
      redemptionId: row.id,
      reason: 'Wallet missing at KYC progression',
      reasonCategory: 'system_error',
    })
    return { redemptionId: row.id, outcome: 'rejected', reason: 'wallet_missing' }
  }

  const drain = computeRedemptionDrainPlan(
    {
      purchased: wallet.balancePurchased,
      earned: wallet.balanceEarned,
      promo: wallet.balancePromo,
      bonus: wallet.balanceBonus,
    },
    row.amountSc,
  )
  if (!drain.covered) {
    await rejectRedemption(ctx, {
      redemptionId: row.id,
      reason: 'Insufficient redeemable balance after KYC',
      reasonCategory: 'eligibility',
    })
    return { redemptionId: row.id, outcome: 'rejected', reason: 'insufficient_balance' }
  }

  const persistedDrain: PersistedDrainStep[] = drain.steps.map((step) => ({
    bucket: step.subBucket,
    amount: step.amount.toString(),
  }))
  await ctx.db
    .update(schema.redemptions)
    .set({ drainPlan: persistedDrain, updatedAt: new Date() })
    .where(eq(schema.redemptions.id, row.id))

  const built = buildRedemptionRequest({
    redemptionId: row.id,
    playerId: row.playerId,
    amount: row.amountSc,
    buckets: {
      purchased: wallet.balancePurchased,
      earned: wallet.balanceEarned,
      promo: wallet.balancePromo,
      bonus: wallet.balanceBonus,
    },
  })

  const writeResult = await ledgerWrite(ctx, built.spec)
  if (!writeResult.ok) {
    return { redemptionId: row.id, outcome: 'skipped', reason: writeResult.error.code }
  }

  if (writeResult.value.status === 'written') {
    await ctx.db
      .update(schema.redemptions)
      .set({ ledgerPairId: writeResult.value.pairId, updatedAt: new Date() })
      .where(eq(schema.redemptions.id, row.id))
  }

  const nextStatus = await determineNextStatus(ctx, {
    playerId: row.playerId,
    redemptionId: row.id,
    amountUsd: row.amountUsd,
  })
  await ctx.db
    .update(schema.redemptions)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.redemptions.id, row.id))

  return { redemptionId: row.id, outcome: 'progressed', nextStatus }
}

export { loadRedemption }
export type { RedemptionRecord }
