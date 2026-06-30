import { env } from '@coinfrenzy/config'

import type {
  FinixClient,
  FinixCreatePayoutInput,
  FinixCreatePayoutResult,
  FinixCreateTransferInput,
  FinixCreateTransferResult,
  FinixGetTransferResult,
} from './types'

// docs/05 §3 — Finix's REST API. We use HTTPS basic auth (USERNAME:PASSWORD
// → API key + secret) plus `Finix-Version` header. Endpoints documented at
// https://docs.finix.com/.
//
// NOTE: Live mode is not exercised during prompt 06 (the founder explicitly
// asked we don't hit Finix until cutover). The implementation is here so a
// single env-var flip switches to real calls.

const FINIX_API_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://finix.live-payments-api.com'
    : 'https://finix.sandbox-payments-api.com'

export class RealFinixClient implements FinixClient {
  readonly mode = 'real' as const

  async createTransfer(input: FinixCreateTransferInput): Promise<FinixCreateTransferResult> {
    const body = {
      amount: Number(input.amountCents),
      currency: input.currency,
      source: input.paymentInstrumentId,
      processor: 'DUMMY_V1',
      tags: {
        ...(input.tags ?? {}),
        purchase_id: input.purchaseId,
        player_id: input.playerId,
      },
    }
    const json = await this.request<{
      id: string
      state: string
      amount: number
      tags: Record<string, string>
    }>('POST', '/transfers', body)
    return {
      transferId: json.id,
      state: mapState(json.state) as FinixCreateTransferResult['state'],
      amountCents: BigInt(json.amount),
      tags: json.tags ?? {},
      raw: json,
    }
  }

  async getTransfer(transferId: string): Promise<FinixGetTransferResult> {
    const json = await this.request<{
      id: string
      state: string
      amount: number
      tags?: Record<string, string>
      failure_code?: string
      failure_message?: string
      network_details?: { threeds_result?: string; eci?: string }
      address_verification?: string
      security_code_verification?: string
      payment_instrument?: { last_four?: string; brand?: string }
    }>('GET', `/transfers/${encodeURIComponent(transferId)}`)
    return {
      transferId: json.id,
      state: mapState(json.state) as FinixGetTransferResult['state'],
      amountCents: BigInt(json.amount),
      tags: json.tags ?? {},
      failureCode: json.failure_code ?? null,
      failureMessage: json.failure_message ?? null,
      threedsResult: json.network_details?.threeds_result ?? null,
      avsResult: json.address_verification ?? null,
      cvvResult: json.security_code_verification ?? null,
      cardLast4: json.payment_instrument?.last_four ?? null,
      cardBrand: json.payment_instrument?.brand ?? null,
      raw: json,
    }
  }

  async createPayout(input: FinixCreatePayoutInput): Promise<FinixCreatePayoutResult> {
    const body = {
      amount: Number(input.amountCents),
      currency: 'USD',
      destination: input.payoutInstrumentId,
      processor: 'DUMMY_V1',
      operation_key: 'PUSH_TO_ACH',
      tags: {
        ...(input.tags ?? {}),
        redemption_id: input.redemptionId,
        player_id: input.playerId,
      },
    }
    const json = await this.request<{
      id: string
      state: string
      amount: number
      tags: Record<string, string>
    }>('POST', '/transfers', body)
    return {
      transferId: json.id,
      state: mapState(json.state) as FinixCreatePayoutResult['state'],
      amountCents: BigInt(json.amount),
      tags: json.tags ?? {},
      raw: json,
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const e = env()
    if (!e.FINIX_API_KEY) throw new Error('FINIX_API_KEY is not set')
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${e.FINIX_API_KEY}:`).toString('base64')}`,
      'Finix-Version': '2022-02-01',
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${FINIX_API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`finix_request_failed:${res.status}:${text.slice(0, 200)}`)
    }
    return JSON.parse(text) as T
  }
}

function mapState(state: string): 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' {
  const upper = state.toUpperCase()
  if (upper === 'SUCCEEDED' || upper === 'FAILED' || upper === 'PENDING' || upper === 'CANCELED') {
    return upper
  }
  return 'PENDING'
}
