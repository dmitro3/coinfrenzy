import type { Context } from '../../context'
import { writeAuditEntry } from '../../audit/index'

import { handleFinixDisputeCreated } from './handlers/dispute-created'
import { handleFinixTransferFailed } from './handlers/transfer-failed'
import { handleFinixTransferSucceeded } from './handlers/transfer-succeeded'

// docs/05 §3 — Finix per-event handler registry. Each handler's signature
// matches what `webhooks.dispatchPendingWebhook` expects:
//   (payload: unknown, ctx2: { rawBody: string }) => Promise<void>
// `ctx` is captured in the closure so the dispatcher stays vendor-agnostic.

type HandlerFn = (payload: unknown, ctx2: { rawBody: string }) => Promise<void>

export function buildFinixHandlers(ctx: Context): Record<string, HandlerFn> {
  return {
    'transfer.succeeded': (payload) =>
      handleFinixTransferSucceeded(
        ctx,
        payload as Parameters<typeof handleFinixTransferSucceeded>[1],
      ),
    'transfer.failed': (payload) =>
      handleFinixTransferFailed(ctx, payload as Parameters<typeof handleFinixTransferFailed>[1]),
    'transfer.created': async (payload) => {
      ctx.logger.info('finix_transfer_created', { id: getEventId(payload) })
    },
    'transfer.canceled': async (payload) => {
      ctx.logger.info('finix_transfer_canceled', { id: getEventId(payload) })
    },
    'authorization.succeeded': async (payload) => {
      ctx.logger.info('finix_authorization_succeeded', { id: getEventId(payload) })
    },
    'authorization.failed': async (payload) => {
      ctx.logger.info('finix_authorization_failed', { id: getEventId(payload) })
    },
    'dispute.created': (payload) =>
      handleFinixDisputeCreated(ctx, payload as Parameters<typeof handleFinixDisputeCreated>[1]),
    'dispute.updated': async (payload) => {
      await writeAuditEntry(ctx.db, {
        actorKind: 'system',
        action: 'webhook.finix.dispute_updated',
        metadata: { event: payload as Record<string, unknown> },
      })
    },
    'settlement.created': async (payload) => {
      ctx.logger.info('finix_settlement_created', { id: getEventId(payload) })
    },
    'settlement.funded': async (payload) => {
      ctx.logger.info('finix_settlement_funded', { id: getEventId(payload) })
    },
    'payment_instrument.created': async (payload) => {
      ctx.logger.info('finix_payment_instrument_created', { id: getEventId(payload) })
    },
    'payment_instrument.updated': async (payload) => {
      ctx.logger.info('finix_payment_instrument_updated', { id: getEventId(payload) })
    },
  }
}

function getEventId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'id' in payload) {
    const value = (payload as Record<string, unknown>).id
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}
