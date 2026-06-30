import { and, eq, ne } from 'drizzle-orm'

import { type DbExecutor, schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { award as bonusAward } from '../../../bonus/engine'
import { redeemPromoCode } from '../../../bonus/redeem-promo'
import { awardBySlug, BONUS_SLUGS } from '../../../bonus/triggers'
import { emit as emitEvent } from '../../../events/index'
import { write as ledgerWrite } from '../../../ledger/index'
import { buildPurchase } from '../../../ledger/transactions/purchase'
import { buildRedemptionPaid } from '../../../ledger/transactions/redemption-paid'
import { publishEvent } from '../../../realtime/index'

// docs/05 §3.4 — Finix transfer.succeeded for a purchase (the main event).
// Out-of-band purchases (no purchase row) are logged + audited but never
// crash the handler. Idempotency: ledger.write enforces (source, source_id)
// uniqueness so reprocessing the same Finix event is a no-op.

interface FinixTransferEntity {
  id: string
  amount: number
  state: string
  operation_key?: string
  tags?: Record<string, string>
  network_details?: { threeds_result?: string; eci?: string }
  address_verification?: string
  security_code_verification?: string
  payment_instrument?: { last_four?: string; brand?: string }
}

interface FinixEventEnvelope {
  id: string
  type: string
  entity: FinixTransferEntity
}

export async function handleFinixTransferSucceeded(
  ctx: Context,
  payload: FinixEventEnvelope,
): Promise<void> {
  const transfer = payload.entity
  const operationKey = transfer.operation_key ?? 'CARD_NOT_PRESENT_SALE'

  if (operationKey === 'PUSH_TO_ACH') {
    await handlePayoutSucceeded(ctx, payload)
    return
  }

  const purchaseId = transfer.tags?.purchase_id
  if (!purchaseId) {
    ctx.logger.error('finix_transfer_no_purchase_id', { transferId: transfer.id })
    await writeAuditEntry(ctx.db, {
      actorKind: 'system',
      action: 'webhook.finix.orphan_transfer',
      resourceKind: 'finix_transfer',
      reason: 'missing purchase_id tag',
      metadata: { transfer_id: transfer.id },
    })
    return
  }

  const purchase = await loadPurchase(ctx.db, purchaseId)
  if (!purchase) {
    ctx.logger.error('finix_transfer_purchase_not_found', { purchaseId })
    return
  }

  // Validate amount matches expectation. Don't crash on mismatch — record
  // a compliance flag for cashier review and skip the ledger write.
  if (transfer.amount !== Number(purchase.amountCents)) {
    await ctx.db.insert(schema.complianceFlags).values({
      playerId: purchase.playerId,
      flagType: 'fraud',
      severity: 'warn',
      reason: 'Finix transfer amount mismatch',
      metadata: {
        expected_cents: purchase.amountCents.toString(),
        received_cents: transfer.amount,
        transfer_id: transfer.id,
      },
    })
    return
  }

  // Update purchase row with the post-auth data Finix returns.
  await ctx.db
    .update(schema.purchases)
    .set({
      status: 'completed',
      finixTransferId: transfer.id,
      finix3dsResult: transfer.network_details?.threeds_result ?? null,
      finix3dsEci: transfer.network_details?.eci ?? null,
      finixAvsResult: transfer.address_verification ?? null,
      finixCvvResult: transfer.security_code_verification ?? null,
      finixCardLast4: transfer.payment_instrument?.last_four ?? null,
      finixCardBrand: transfer.payment_instrument?.brand ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.purchases.id, purchase.id))

  // docs/04 §3.1 — write the 6 purchase ledger entries.
  //
  // For prompt 06 we assume the purchase row already carries the package
  // splits in baseGc/baseSc/bonusGc/bonusSc. The full purchase intent flow
  // (lobby cart, package picker) lands in a later prompt; tests instantiate
  // a purchase row directly.
  const spec = buildPurchase({
    finixTransferId: transfer.id,
    purchaseId: purchase.id,
    playerId: purchase.playerId,
    isInternalAccount: false,
    amountUsd: bigintToFourDecimal(purchase.amountCents),
    gcAwarded: purchase.baseGc + purchase.bonusGc,
    scSplit: {
      purchased: purchase.baseSc,
      bonus: purchase.bonusSc,
      promo: 0n,
    },
  })

  const writeResult = await ledgerWrite(ctx, spec)
  if (!writeResult.ok) {
    ctx.logger.error('finix_purchase_ledger_write_failed', {
      purchaseId: purchase.id,
      error: writeResult.error,
    })
    throw new Error(`ledger_write_failed:${writeResult.error.code}`)
  }

  // CRM + realtime hooks. We use the typed events.emit() so the Inngest
  // dispatch fans out to flow triggers (Welcome, First Purchase, etc.) per
  // docs/11 §5.
  const earlierForFirst = await ctx.db
    .select({ id: schema.purchases.id })
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.playerId, purchase.playerId),
        eq(schema.purchases.status, 'completed'),
        ne(schema.purchases.id, purchase.id),
      ),
    )
    .limit(1)
  await emitEvent(ctx, {
    name: 'player.purchase.succeeded',
    data: {
      playerId: purchase.playerId,
      purchaseId: purchase.id,
      transferId: transfer.id,
      amount: bigintToFourDecimal(purchase.amountCents),
      currency: 'USD',
      isFirstPurchase: earlierForFirst.length === 0,
    },
  })

  await publishEvent(`private-player-${purchase.playerId}`, 'balance-update', {
    reason: 'purchase',
  })

  // docs/06 §13 — fire the welcome / package / purchase_promocode triggers
  // here. Welcome only on the player's first completed purchase; package
  // only when `packages.bonus_id` is set; promo code only when one was
  // attached to the purchase row. All three are no-ops if the operator has
  // disabled the templates.
  await firePurchaseBonuses(ctx, purchase)

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'webhook.finix.transfer_succeeded',
    resourceKind: 'purchase',
    resourceId: purchase.id,
    metadata: {
      transfer_id: transfer.id,
      amount_cents: transfer.amount,
    },
  })
}

async function firePurchaseBonuses(ctx: Context, purchase: PurchaseRow): Promise<void> {
  const purchaseAmount = bigintToFourDecimal(purchase.amountCents)

  // Welcome bonus — fires only on the first completed purchase per player.
  // The query excludes the current purchase (which is still flipping to
  // 'completed' in the same handler).
  const earlier = await ctx.db
    .select({ id: schema.purchases.id })
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.playerId, purchase.playerId),
        eq(schema.purchases.status, 'completed'),
        ne(schema.purchases.id, purchase.id),
      ),
    )
    .limit(1)
  if (earlier.length === 0) {
    const welcome = await awardBySlug(ctx, BONUS_SLUGS.welcome, {
      playerId: purchase.playerId,
      sourceKind: 'purchase',
      sourceId: `${purchase.id}:welcome`,
      context: { purchaseAmount },
      reason: `Welcome bonus — first purchase ${purchase.id}`,
    })
    if (!welcome.ok) {
      ctx.logger.info('welcome_bonus_skipped', {
        playerId: purchase.playerId,
        purchaseId: purchase.id,
        code: welcome.error.code,
      })
    }
  }

  // Package bonus — only if the package row carries a bonus_id.
  if (purchase.packageId) {
    const pkgRows = await ctx.db
      .select({ bonusId: schema.packages.bonusId })
      .from(schema.packages)
      .where(eq(schema.packages.id, purchase.packageId))
      .limit(1)
    const pkgBonusId = pkgRows[0]?.bonusId ?? null
    if (pkgBonusId) {
      const pkgAward = await bonusAward(ctx, {
        playerId: purchase.playerId,
        bonusId: pkgBonusId,
        sourceKind: 'purchase',
        sourceId: `${purchase.id}:package`,
        context: { purchaseAmount },
        reason: `Package bonus for purchase ${purchase.id}`,
      })
      if (!pkgAward.ok) {
        ctx.logger.info('package_bonus_skipped', {
          playerId: purchase.playerId,
          purchaseId: purchase.id,
          code: pkgAward.error.code,
        })
      }
    }
  }

  // purchase_promocode — the player typed a code at checkout.
  if (purchase.promoCode) {
    const promo = await redeemPromoCode(ctx, {
      playerId: purchase.playerId,
      code: purchase.promoCode,
      context: 'purchase',
      awardContext: { purchaseAmount },
    })
    if (!promo.ok) {
      ctx.logger.info('purchase_promocode_skipped', {
        playerId: purchase.playerId,
        purchaseId: purchase.id,
        code: promo.error.code,
      })
    }
  }
}

async function handlePayoutSucceeded(ctx: Context, payload: FinixEventEnvelope): Promise<void> {
  const transfer = payload.entity
  const redemptionId = transfer.tags?.redemption_id
  if (!redemptionId) {
    ctx.logger.error('finix_payout_no_redemption_id', { transferId: transfer.id })
    return
  }

  const redemption = await loadRedemption(ctx.db, redemptionId)
  if (!redemption) {
    ctx.logger.error('finix_payout_redemption_not_found', { redemptionId })
    return
  }

  await ctx.db
    .update(schema.redemptions)
    .set({
      status: 'paid',
      finixTransferId: transfer.id,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.redemptions.id, redemption.id))

  // docs/04 §3.8 — redemption paid ledger entries.
  // The redemption flow's "request" step (prompt 08) debits player_wallet SC
  // and credits pending_redemption SC. transfer.succeeded fires the paid
  // entries: debit pending_redemption SC / credit external SC + debit
  // house_bank USD / credit external USD.
  const spec = buildRedemptionPaid({
    redemptionId: redemption.id,
    playerId: redemption.playerId,
    scAmount: redemption.amountSc,
    usdAmount: redemption.amountUsd,
    metadata: { finix_transfer_id: transfer.id },
  })

  const result = await ledgerWrite(ctx, spec)
  if (!result.ok) {
    ctx.logger.error('finix_payout_ledger_write_failed', {
      redemptionId: redemption.id,
      error: result.error,
    })
    throw new Error(`ledger_write_failed:${result.error.code}`)
  }

  await emitEvent(ctx, {
    name: 'player.redemption.paid',
    data: {
      playerId: redemption.playerId,
      redemptionId: redemption.id,
      transferId: transfer.id,
      amount: redemption.amountUsd,
      currency: 'USD',
    },
  })

  await publishEvent(`private-player-${redemption.playerId}`, 'redemption-update', {
    redemptionId: redemption.id,
    status: 'paid',
  })
}

interface PurchaseRow {
  id: string
  playerId: string
  packageId: string | null
  amountCents: bigint
  baseGc: bigint
  baseSc: bigint
  bonusGc: bigint
  bonusSc: bigint
  promoCode: string | null
}

async function loadPurchase(db: DbExecutor, purchaseId: string): Promise<PurchaseRow | null> {
  const rows = await db
    .select({
      id: schema.purchases.id,
      playerId: schema.purchases.playerId,
      packageId: schema.purchases.packageId,
      amountCents: schema.purchases.amountCents,
      baseGc: schema.purchases.baseGc,
      baseSc: schema.purchases.baseSc,
      bonusGc: schema.purchases.bonusGc,
      bonusSc: schema.purchases.bonusSc,
      promoCode: schema.purchases.promoCode,
    })
    .from(schema.purchases)
    .where(eq(schema.purchases.id, purchaseId))
    .limit(1)
  return rows[0] ?? null
}

interface RedemptionRow {
  id: string
  playerId: string
  amountSc: bigint
  amountUsd: bigint
}

async function loadRedemption(db: DbExecutor, redemptionId: string): Promise<RedemptionRow | null> {
  const rows = await db
    .select({
      id: schema.redemptions.id,
      playerId: schema.redemptions.playerId,
      amountSc: schema.redemptions.amountSc,
      amountUsd: schema.redemptions.amountUsd,
    })
    .from(schema.redemptions)
    .where(eq(schema.redemptions.id, redemptionId))
    .limit(1)
  return rows[0] ?? null
}

function bigintToFourDecimal(value: bigint): bigint {
  // amountCents stores cents (10^-2); the ledger's money type is in minor
  // units at 10^-4. Multiply by 100 (= 10000 / 100) to widen the scale.
  return value * 100n
}
