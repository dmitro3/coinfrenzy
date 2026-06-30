import { randomUUID } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import {
  evaluateRedemptionRules,
  listActiveRedemptionRules,
  type RedemptionEvaluationContext,
} from '../cashier/redemption-rules'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'
import { write as ledgerWrite } from '../ledger/write'
import { computeRedemptionDrainPlan } from '../ledger/drain-order'
import { buildRedemptionRequest } from '../ledger/transactions/redemption-request'
import { publishEvent } from '../realtime/pusher'

import { SC_TO_USD_RATE } from './constants'
import {
  checkRedemptionEligibility,
  isWithinAutoApproveThreshold,
  type EligibilitySpec,
} from './eligibility'
import type {
  PersistedDrainStep,
  RedemptionError,
  RedemptionMethod,
  RedemptionRecord,
  RedemptionStatus,
} from './types'

// docs/07 §5 — create a redemption.
//
// Sequence:
//   1. Re-check eligibility (route layer also calls this; defense in depth).
//   2. Compute the drain plan (purchased -> earned FIFO).
//   3. Insert the redemptions row with status='requested' + drain_plan jsonb.
//   4. Write the redemption_request ledger entries (debit player_wallet SC,
//      credit pending_redemption SC). ledger.write opens its own
//      serializable transaction; the row insert above lives outside it.
//   5. Determine next status (auto_approve vs pending_review vs kyc_pending
//      vs aml_hold) and update the row.
//   6. Audit, CRM event, push notification.
//
// Note: the row insert and ledger write are NOT wrapped in a single outer tx
// because ledger.write needs serializable isolation, and Postgres rejects
// `set transaction isolation level` inside an existing tx (see write.ts §1).
// If the ledger write fails after the row insert succeeds, we delete the
// row before returning the error — there's no half-state in the DB.

export interface CreateRedemptionSpec {
  playerId: string
  amountSc: bigint
  method: RedemptionMethod
  paymentInstrumentId?: string | null
  ipAtRequest?: string | null
  stateAtRequest?: string | null
  ipState?: string | null
  isProxy?: boolean
  /** Optional explicit eligibility result — skips re-check (used when route already ran it). */
  precheck?: Awaited<ReturnType<typeof checkRedemptionEligibility>>
}

export async function createRedemption(
  ctx: Context,
  spec: CreateRedemptionSpec,
): Promise<Result<RedemptionRecord, RedemptionError>> {
  // Step 1 — eligibility.
  const eligSpec: EligibilitySpec = {
    playerId: spec.playerId,
    amountSc: spec.amountSc,
    method: spec.method,
    paymentInstrumentId: spec.paymentInstrumentId ?? null,
    ipState: spec.ipState ?? null,
    isProxy: spec.isProxy === true,
  }
  const eligibility = spec.precheck ?? (await checkRedemptionEligibility(ctx, eligSpec))
  if (!eligibility.allowed) {
    return err({ code: 'INELIGIBLE', detail: eligibility })
  }

  // Step 2 — drain plan from current sub-buckets.
  const walletRows = await ctx.db
    .select({
      balancePurchased: schema.wallets.balancePurchased,
      balanceBonus: schema.wallets.balanceBonus,
      balancePromo: schema.wallets.balancePromo,
      balanceEarned: schema.wallets.balanceEarned,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, spec.playerId), eq(schema.wallets.currency, 'SC')))
    .limit(1)
  const wallet = walletRows[0]
  if (!wallet) return err({ code: 'WALLET_NOT_FOUND' })

  const drain = computeRedemptionDrainPlan(
    {
      purchased: wallet.balancePurchased,
      earned: wallet.balanceEarned,
      promo: wallet.balancePromo,
      bonus: wallet.balanceBonus,
    },
    spec.amountSc,
  )

  if (!drain.covered) {
    // Should not happen — eligibility just verified the same buckets sum
    // to >= amount. Guard anyway so a race surfaces as INELIGIBLE rather
    // than a half-baked redemption.
    return err({
      code: 'INELIGIBLE',
      detail: {
        allowed: false,
        code: 'INSUFFICIENT_REDEEMABLE_BALANCE',
        detail: {
          available: (wallet.balancePurchased + wallet.balanceEarned).toString(),
        },
      },
    })
  }

  const persistedDrain: PersistedDrainStep[] = drain.steps.map((step) => ({
    bucket: step.subBucket,
    amount: step.amount.toString(),
  }))

  // Step 3 — insert the redemptions row in 'requested'.
  const redemptionId = randomUUID()
  const amountUsd = (spec.amountSc * SC_TO_USD_RATE) / 1n
  const initialStatus: RedemptionStatus = eligibility.requiresKyc ? 'kyc_pending' : 'requested'

  await ctx.db.insert(schema.redemptions).values({
    id: redemptionId,
    playerId: spec.playerId,
    amountSc: spec.amountSc,
    amountUsd,
    method: spec.method,
    paymentInstrumentId: spec.paymentInstrumentId ?? null,
    drainPlan: persistedDrain,
    status: initialStatus,
    ipAtRequest: spec.ipAtRequest ?? null,
    stateAtRequest: spec.stateAtRequest ?? null,
  })

  // If KYC isn't done yet, we DO NOT lock SC in pending_redemption — the
  // player hasn't actually committed funds to a payout. The row exists so
  // the kyc-completion handler can pick it up and re-route. The funds
  // remain spendable in their wallet until they re-confirm post-KYC.
  if (eligibility.requiresKyc) {
    await emitCreatedSideEffects(
      ctx,
      redemptionId,
      spec.playerId,
      amountUsd,
      spec.method,
      'kyc_pending',
    )
    const fetched = await loadRedemption(ctx, redemptionId)
    if (!fetched)
      return err({ code: 'DATABASE_ERROR', detail: 'redemption_disappeared_post_insert' })
    return ok(fetched)
  }

  // Step 4 — ledger write (locks SC in pending_redemption).
  const built = buildRedemptionRequest({
    redemptionId,
    playerId: spec.playerId,
    amount: spec.amountSc,
    buckets: {
      purchased: wallet.balancePurchased,
      earned: wallet.balanceEarned,
      promo: wallet.balancePromo,
      bonus: wallet.balanceBonus,
    },
  })

  const writeResult = await ledgerWrite(ctx, built.spec)
  if (!writeResult.ok) {
    // Roll back the bare row so we don't leak a `requested` redemption.
    await ctx.db.delete(schema.redemptions).where(eq(schema.redemptions.id, redemptionId))
    return err({ code: 'LEDGER_WRITE_FAILED', reason: writeResult.error.code })
  }

  if (writeResult.value.status === 'duplicate') {
    // (source, source_id) already exists — fetch the existing row.
    const existing = await loadRedemption(ctx, redemptionId)
    if (existing) return ok(existing)
    return err({ code: 'DUPLICATE' })
  }

  // Persist the ledger pair_id alongside the redemption for traceability.
  await ctx.db
    .update(schema.redemptions)
    .set({ ledgerPairId: writeResult.value.pairId, updatedAt: new Date() })
    .where(eq(schema.redemptions.id, redemptionId))

  // Step 5 — determine the next status.
  const nextStatus = await determineNextStatus(ctx, {
    playerId: spec.playerId,
    redemptionId,
    amountUsd,
  })

  if (nextStatus !== 'requested') {
    await ctx.db
      .update(schema.redemptions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(schema.redemptions.id, redemptionId))
  }

  // Step 6 — side effects.
  await emitCreatedSideEffects(ctx, redemptionId, spec.playerId, amountUsd, spec.method, nextStatus)

  const final = await loadRedemption(ctx, redemptionId)
  if (!final) return err({ code: 'DATABASE_ERROR', detail: 'redemption_disappeared_post_write' })
  return ok(final)
}

// --- helpers ---------------------------------------------------------------

interface NextStatusInput {
  playerId: string
  redemptionId: string
  amountUsd: bigint
}

/**
 * docs/07 §5.1 — auto vs manual review routing.
 *
 * The decision graph runs:
 *   1. AML watchlist hit                            → aml_hold (manager-only clear)
 *   2. Active operator rules (redemption_rules)     → match wins → auto_approve / pending_review
 *   3. Recent fraud signals (geo_history last 7d)   → pending_review
 *   4. Hard-coded AUTO_APPROVE_THRESHOLD_USD fallback (defense-in-depth
 *      if the rules table is empty or all rules archived)
 *
 * Rules win over the legacy constant so the operator's choices reflect
 * in the auto-approval flow. The constant remains as the safe-default
 * floor — if no rule exists, we still won't auto-approve anything bigger
 * than the historical $50 ceiling.
 */
export async function determineNextStatus(
  ctx: Context,
  input: NextStatusInput,
): Promise<RedemptionStatus> {
  const amlRows = await ctx.db
    .select({ id: schema.complianceFlags.id })
    .from(schema.complianceFlags)
    .where(
      and(
        eq(schema.complianceFlags.playerId, input.playerId),
        eq(schema.complianceFlags.flagType, 'aml_watchlist'),
        isNull(schema.complianceFlags.clearedAt),
      ),
    )
    .limit(1)
  if (amlRows.length > 0) return 'aml_hold'

  // Recent fraud signals on geo_history (last 7d) → review. This sits
  // above the rule engine because no operator rule should be able to
  // accidentally auto-approve a flagged player.
  const recentFraud = await ctx.db
    .select({ id: schema.geoHistory.id })
    .from(schema.geoHistory)
    .where(
      and(
        eq(schema.geoHistory.playerId, input.playerId),
        sql`(${schema.geoHistory.isProxy} = true or ${schema.geoHistory.isCompromised} = true or ${schema.geoHistory.isJumped} = true)`,
        sql`${schema.geoHistory.createdAt} > now() - interval '7 days'`,
      ),
    )
    .limit(1)
  if (recentFraud.length > 0) return 'pending_review'

  // Snapshot the player so the rule engine sees the same numbers
  // visible in the cashier UI.
  const [player] = await ctx.db
    .select({
      kycLevel: schema.players.kycLevel,
      state: schema.players.state,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)

  const priorPaid = await ctx.db
    .select({ id: schema.redemptions.id })
    .from(schema.redemptions)
    .where(
      and(eq(schema.redemptions.playerId, input.playerId), eq(schema.redemptions.status, 'paid')),
    )
  const priorPaidCount = priorPaid.length

  const rules = await listActiveRedemptionRules(ctx)
  if (rules.length > 0) {
    const evalCtx: RedemptionEvaluationContext = {
      amountUsd: input.amountUsd,
      kycLevel: player?.kycLevel ?? 0,
      state: player?.state ?? null,
      priorPaidRedemptionCount: priorPaidCount,
    }
    const result = evaluateRedemptionRules(rules, evalCtx)
    if (result.action === 'auto_approve') return 'approved'
    // route_to_review or no match → pending_review
    return 'pending_review'
  }

  // Legacy fallback path — no rules configured. Keep the original
  // gamma-parity behaviour so an empty rules table doesn't change
  // semantics.
  if (priorPaidCount === 0) return 'pending_review'
  if (!isWithinAutoApproveThreshold(input.amountUsd)) return 'pending_review'
  return 'approved'
}

async function emitCreatedSideEffects(
  ctx: Context,
  redemptionId: string,
  playerId: string,
  amountUsd: bigint,
  method: RedemptionMethod,
  status: RedemptionStatus,
): Promise<void> {
  await writeAuditEntry(ctx.db, {
    actorKind: 'player',
    actorId: playerId,
    action: 'redemption.created',
    resourceKind: 'redemption',
    resourceId: redemptionId,
    after: { status, amount_usd: amountUsd.toString(), method },
  })

  await recordPlayerEvent(ctx.db, {
    playerId,
    eventName: 'player.redemption.requested',
    eventCategory: 'redemption',
    payload: {
      redemption_id: redemptionId,
      amount_usd: amountUsd.toString(),
      method,
      status,
    },
    amount: amountUsd,
    currency: 'USD',
  })

  await publishEvent(`private-player-${playerId}`, 'redemption-update', {
    redemptionId,
    status,
  })
}

export async function loadRedemption(
  ctx: Context,
  redemptionId: string,
): Promise<RedemptionRecord | null> {
  const rows = await ctx.db
    .select()
    .from(schema.redemptions)
    .where(eq(schema.redemptions.id, redemptionId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return rowToRecord(row)
}

export function rowToRecord(row: typeof schema.redemptions.$inferSelect): RedemptionRecord {
  return {
    id: row.id,
    playerId: row.playerId,
    amountSc: row.amountSc,
    amountUsd: row.amountUsd,
    method: row.method as RedemptionMethod,
    paymentInstrumentId: row.paymentInstrumentId,
    status: row.status as RedemptionStatus,
    drainPlan: Array.isArray(row.drainPlan) ? (row.drainPlan as PersistedDrainStep[]) : [],
    finixTransferId: row.finixTransferId,
    aptTransferId: row.aptTransferId,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt,
    rejectionReason: row.rejectionReason,
    rejectionCategory: row.rejectionCategory,
    failureReason: row.failureReason,
    submittedToFinixAt: row.submittedToFinixAt,
    paidAt: row.paidAt,
    requestedAt: row.requestedAt,
    createdAt: row.createdAt,
  }
}
