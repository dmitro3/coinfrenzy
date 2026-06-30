import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { recordPlayerEvent } from '../../../events/index'
import { publishEvent } from '../../../realtime/index'

// docs/05 §3.4 — dispute.created. We record the chargeback, flag the
// player for cashier review, and notify the cashier channel. Clawback
// ledger entries fire later (dispute.lost path or admin confirmation).

interface FinixDisputeEntity {
  id: string
  transfer: string
  reason_code?: string
  amount?: number
  respond_by?: string
}

interface FinixDisputeEvent {
  id: string
  type: string
  entity: FinixDisputeEntity
}

export async function handleFinixDisputeCreated(
  ctx: Context,
  payload: FinixDisputeEvent,
): Promise<void> {
  const dispute = payload.entity

  const purchaseRows = await ctx.db
    .select({ id: schema.purchases.id, playerId: schema.purchases.playerId })
    .from(schema.purchases)
    .where(eq(schema.purchases.finixTransferId, dispute.transfer))
    .limit(1)
  const purchase = purchaseRows[0]
  if (!purchase) {
    ctx.logger.error('finix_dispute_purchase_not_found', {
      disputeId: dispute.id,
      transferId: dispute.transfer,
    })
    return
  }

  await ctx.db.insert(schema.complianceFlags).values({
    playerId: purchase.playerId,
    flagType: 'dispute',
    severity: 'warn',
    reason: `Chargeback opened on transfer ${dispute.transfer}`,
    metadata: {
      finix_dispute_id: dispute.id,
      reason_code: dispute.reason_code,
      amount_cents: dispute.amount ?? null,
    },
  })

  await ctx.db
    .update(schema.purchases)
    .set({ status: 'disputed', updatedAt: new Date() })
    .where(eq(schema.purchases.id, purchase.id))

  await publishEvent('admin-cashier-alerts', 'dispute-created', {
    disputeId: dispute.id,
    playerId: purchase.playerId,
    purchaseId: purchase.id,
    amountCents: dispute.amount ?? null,
  })

  await recordPlayerEvent(ctx.db, {
    playerId: purchase.playerId,
    eventName: 'player.purchase.disputed',
    eventCategory: 'purchase',
    payload: {
      purchase_id: purchase.id,
      finix_dispute_id: dispute.id,
    },
  })

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'webhook.finix.dispute_created',
    resourceKind: 'purchase',
    resourceId: purchase.id,
    metadata: {
      finix_dispute_id: dispute.id,
      reason_code: dispute.reason_code,
    },
  })
}
