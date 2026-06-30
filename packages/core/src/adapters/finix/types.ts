import type { Currency } from '@coinfrenzy/config'

// docs/05 §3 — typed Finix surface. Adapter consumers see ONLY these types;
// the wire-format JSON is the adapter's secret.

export interface FinixCreateTransferInput {
  purchaseId: string
  playerId: string
  paymentInstrumentId: string
  /** Amount in cents (USD minor units). Per Finix's API contract. */
  amountCents: bigint
  currency: Extract<Currency, 'USD'>
  /** Free-form tag map. We persist `purchase_id` here so webhooks can find us. */
  tags?: Record<string, string>
  /** Used for risk + 3DS hints (Finix returns them on the transfer object). */
  ip?: string | null
}

export interface FinixCreateTransferResult {
  transferId: string
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  amountCents: bigint
  /** Echo of our tags so the caller can attest to the round-trip. */
  tags: Record<string, string>
  raw?: unknown
}

export interface FinixGetTransferResult {
  transferId: string
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
  amountCents: bigint
  tags: Record<string, string>
  failureCode?: string | null
  failureMessage?: string | null
  threedsResult?: string | null
  avsResult?: string | null
  cvvResult?: string | null
  cardLast4?: string | null
  cardBrand?: string | null
  raw?: unknown
}

export interface FinixCreatePayoutInput {
  redemptionId: string
  playerId: string
  payoutInstrumentId: string
  amountCents: bigint
  tags?: Record<string, string>
}

export interface FinixCreatePayoutResult {
  transferId: string
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  amountCents: bigint
  tags: Record<string, string>
  raw?: unknown
}

export interface FinixClient {
  createTransfer(input: FinixCreateTransferInput): Promise<FinixCreateTransferResult>
  getTransfer(transferId: string): Promise<FinixGetTransferResult>
  createPayout(input: FinixCreatePayoutInput): Promise<FinixCreatePayoutResult>
  /** Stable label used by health + audit log. */
  readonly mode: 'mock' | 'real'
}
