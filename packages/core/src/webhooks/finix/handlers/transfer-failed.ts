import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { recordPlayerEvent } from '../../../events/index'
import { rejectRedemption } from '../../../redemption/reject'

// docs/05 §3.4 — transfer.failed. For purchases, no money moved so we
// just touch the purchase row + emit a CRM event. For redemption payouts
// (operation_key = PUSH_TO_ACH OR redemption_id present in tags) the SC
// has been locked in pending_redemption, so we must return it via the
// standard rejectRedemption path with finalStatus='failed'.

interface FinixTransferEntity {
  id: string
  tags?: Record<string, string>
  operation_key?: string
  failure_code?: string | null
  failure_message?: string | null
}

interface FinixEventEnvelope {
  id: string
  type: string
  entity: FinixTransferEntity
}

export async function handleFinixTransferFailed(
  ctx: Context,
  payload: FinixEventEnvelope,
): Promise<void> {
  const transfer = payload.entity
  const redemptionId = transfer.tags?.redemption_id
  if (redemptionId || transfer.operation_key === 'PUSH_TO_ACH') {
    if (!redemptionId) {
      ctx.logger.error('finix_payout_failed_no_redemption_id', {
        transferId: transfer.id,
      })
      return
    }
    await rejectRedemption(ctx, {
      redemptionId,
      reason: transfer.failure_message ?? transfer.failure_code ?? 'finix_failed',
      reasonCategory: 'processor_error',
      finalStatus: 'failed',
    })
    await writeAuditEntry(ctx.db, {
      actorKind: 'system',
      action: 'webhook.finix.payout_failed',
      resourceKind: 'redemption',
      resourceId: redemptionId,
      metadata: {
        transfer_id: transfer.id,
        failure_code: transfer.failure_code,
      },
    })
    return
  }

  const purchaseId = transfer.tags?.purchase_id
  if (!purchaseId) {
    ctx.logger.info('finix_transfer_failed_no_purchase_id', { transferId: transfer.id })
    return
  }

  const rows = await ctx.db
    .select({ playerId: schema.purchases.playerId })
    .from(schema.purchases)
    .where(eq(schema.purchases.id, purchaseId))
    .limit(1)
  const purchase = rows[0]
  if (!purchase) return

  await ctx.db
    .update(schema.purchases)
    .set({
      status: 'failed',
      finixTransferId: transfer.id,
      failureReason: transfer.failure_code ?? null,
      failureMessage: transfer.failure_message ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.purchases.id, purchaseId))

  await recordPlayerEvent(ctx.db, {
    playerId: purchase.playerId,
    eventName: 'player.purchase.failed',
    eventCategory: 'purchase',
    payload: {
      purchase_id: purchaseId,
      failure_code: transfer.failure_code,
      transfer_id: transfer.id,
    },
  })

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'webhook.finix.transfer_failed',
    resourceKind: 'purchase',
    resourceId: purchaseId,
    metadata: {
      transfer_id: transfer.id,
      failure_code: transfer.failure_code,
    },
  })
}
