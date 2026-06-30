import { randomUUID } from 'node:crypto'

import { env } from '@coinfrenzy/config'

import type {
  FinixClient,
  FinixCreatePayoutInput,
  FinixCreatePayoutResult,
  FinixCreateTransferInput,
  FinixCreateTransferResult,
  FinixGetTransferResult,
} from './types'

// Mock Finix client per the founder's prompt-06 addendum:
//   "purchase intent returns a transfer_id; simulate the transfer.succeeded
//    webhook after a 2-second delay; payload shape matches Finix's actual
//    webhook docs (use docs/05 §3 as source)"
//
// `createTransfer` stores the intent in process memory (so getTransfer can
// echo it) AND fires the webhook asynchronously via fetch to our own
// receiver. The route handler signs the payload using `signMockFinixBody`
// so verification flows through the real verifier code path.

interface StoredTransfer {
  transferId: string
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  amountCents: bigint
  tags: Record<string, string>
  purchaseId?: string
  redemptionId?: string
  createdAt: number
}

const STORE = new Map<string, StoredTransfer>()

export class MockFinixClient implements FinixClient {
  readonly mode = 'mock' as const

  async createTransfer(input: FinixCreateTransferInput): Promise<FinixCreateTransferResult> {
    const transferId = `TR_mock_${randomUUID().replace(/-/g, '').slice(0, 18)}`
    const tags = {
      ...(input.tags ?? {}),
      purchase_id: input.purchaseId,
      player_id: input.playerId,
    }
    STORE.set(transferId, {
      transferId,
      state: 'PENDING',
      amountCents: input.amountCents,
      tags,
      purchaseId: input.purchaseId,
      createdAt: Date.now(),
    })

    // Fire the webhook back to our own receiver 2 seconds out. We don't
    // await — the caller returns the transfer_id immediately, identical to
    // the live Finix behavior. The webhook receiver writes the ledger.
    void scheduleMockWebhook({
      delayMs: 2000,
      payload: buildFinixTransferSucceededPayload({
        transferId,
        amountCents: input.amountCents,
        tags,
        operationKey: 'CARD_NOT_PRESENT_SALE',
      }),
    })

    return {
      transferId,
      state: 'PENDING',
      amountCents: input.amountCents,
      tags,
    }
  }

  async getTransfer(transferId: string): Promise<FinixGetTransferResult> {
    const stored = STORE.get(transferId)
    if (!stored) {
      // Treat unknown transfer ids as missing so the stuck-transfer poller
      // can detect them as orphans.
      throw new Error(`mock_finix_unknown_transfer:${transferId}`)
    }
    // After 2 seconds we report SUCCEEDED to model the eventual-consistency
    // window between intent creation and webhook delivery.
    const succeeded = Date.now() - stored.createdAt >= 1500
    return {
      transferId,
      state: succeeded ? 'SUCCEEDED' : 'PENDING',
      amountCents: stored.amountCents,
      tags: stored.tags,
      failureCode: null,
      failureMessage: null,
      threedsResult: 'AUTHENTICATED',
      avsResult: 'POSTAL_CODE_AND_STREET_MATCH',
      cvvResult: 'MATCHED',
      cardLast4: '4242',
      cardBrand: 'VISA',
    }
  }

  async createPayout(input: FinixCreatePayoutInput): Promise<FinixCreatePayoutResult> {
    const transferId = `TR_mock_payout_${randomUUID().replace(/-/g, '').slice(0, 18)}`
    const tags = {
      ...(input.tags ?? {}),
      redemption_id: input.redemptionId,
      player_id: input.playerId,
    }
    STORE.set(transferId, {
      transferId,
      state: 'PENDING',
      amountCents: input.amountCents,
      tags,
      redemptionId: input.redemptionId,
      createdAt: Date.now(),
    })

    void scheduleMockWebhook({
      delayMs: 2000,
      payload: buildFinixTransferSucceededPayload({
        transferId,
        amountCents: input.amountCents,
        tags,
        operationKey: 'PUSH_TO_ACH',
      }),
    })

    return {
      transferId,
      state: 'PENDING',
      amountCents: input.amountCents,
      tags,
    }
  }
}

interface MockWebhookSchedule {
  delayMs: number
  payload: Record<string, unknown>
}

async function scheduleMockWebhook(schedule: MockWebhookSchedule): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, schedule.delayMs))
  const { WEBHOOK_BASE_URL } = env()
  const url = `${WEBHOOK_BASE_URL ?? 'http://localhost:3000'}/api/webhooks/finix/v1`
  const rawBody = JSON.stringify(schedule.payload)
  // We import lazily to avoid a static cycle with verify-webhook (which
  // also imports config). Dynamic import is safe — this code path is only
  // exercised by the mock, never by production.
  const { signMockFinixBody } = await import('./verify-webhook')
  const signature = signMockFinixBody(rawBody)

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'finix-signature': signature,
      },
      body: rawBody,
    })
  } catch (e) {
    // Don't blow up the caller if the webhook can't reach us (e.g. test
    // running offline). The poller would catch a real Finix transfer that
    // was missed in production.
    // eslint-disable-next-line no-console
    console.warn('[mock-finix] webhook delivery failed', {
      url,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

export interface BuildFinixPayloadInput {
  transferId: string
  amountCents: bigint
  tags: Record<string, string>
  operationKey: 'CARD_NOT_PRESENT_SALE' | 'PUSH_TO_ACH'
  state?: 'SUCCEEDED' | 'FAILED'
  failureCode?: string
  failureMessage?: string
}

export function buildFinixTransferSucceededPayload(
  input: BuildFinixPayloadInput,
): Record<string, unknown> {
  const eventId = `WH${randomUUID().replace(/-/g, '').slice(0, 24)}`
  const state = input.state ?? 'SUCCEEDED'
  const isFailure = state === 'FAILED'
  return {
    id: eventId,
    type: isFailure ? 'transfer.failed' : 'transfer.succeeded',
    entity: {
      id: input.transferId,
      amount: Number(input.amountCents),
      currency: 'USD',
      state,
      operation_key: input.operationKey,
      tags: input.tags,
      network_details: { threeds_result: 'AUTHENTICATED', eci: '05' },
      address_verification: 'POSTAL_CODE_AND_STREET_MATCH',
      security_code_verification: 'MATCHED',
      payment_instrument: { last_four: '4242', brand: 'VISA' },
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
    },
    created_at: new Date().toISOString(),
  }
}

/** Tests: reset in-process state between cases. */
export function _resetMockFinixStore(): void {
  STORE.clear()
}
