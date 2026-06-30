import { webhooks, type adapters, type Context } from '@coinfrenzy/core'

type FinixGetTransferResult = Awaited<ReturnType<adapters.finix.FinixClient['getTransfer']>>

// docs/05 §9.5 + docs/07 §8.1 — when the polling loop discovers a payout
// reached a terminal state, replay the same handler the live webhook would
// have fired. Build a synthetic webhook envelope so the existing handler
// code is the single source of truth for ledger writes + status updates.

export interface DispatchInput {
  redemptionId: string
  transfer: FinixGetTransferResult
}

export async function dispatchPolledFinixPayout(ctx: Context, input: DispatchInput): Promise<void> {
  // Tags from a getTransfer() call may not include redemption_id (the live
  // webhook always carries the tag); we re-inject it from the row we know
  // about so the downstream handler can route correctly.
  const tags = {
    ...(input.transfer.tags ?? {}),
    redemption_id: input.redemptionId,
  }

  const envelope = {
    id: `WH_poll_${input.transfer.transferId}`,
    type: input.transfer.state === 'SUCCEEDED' ? 'transfer.succeeded' : 'transfer.failed',
    entity: {
      id: input.transfer.transferId,
      amount: Number(input.transfer.amountCents),
      state: input.transfer.state,
      operation_key: 'PUSH_TO_ACH',
      tags,
      failure_code: input.transfer.failureCode ?? null,
      failure_message: input.transfer.failureMessage ?? null,
      network_details: {
        threeds_result: input.transfer.threedsResult ?? null,
        eci: null,
      },
      address_verification: input.transfer.avsResult ?? null,
      security_code_verification: input.transfer.cvvResult ?? null,
      payment_instrument: {
        last_four: input.transfer.cardLast4 ?? null,
        brand: input.transfer.cardBrand ?? null,
      },
    },
    created_at: new Date().toISOString(),
  } as const

  // The live transfer.succeeded + transfer.failed handlers already know
  // how to route a payout (redemption_id tag → redemption flow) vs a
  // purchase. Replay the matching handler so the polling path and the
  // live webhook path share one code path.
  const handlers = webhooks.finix.buildFinixHandlers(ctx)
  const handler =
    input.transfer.state === 'SUCCEEDED'
      ? handlers['transfer.succeeded']
      : handlers['transfer.failed']
  if (handler) await handler(envelope, { rawBody: '' })
}
