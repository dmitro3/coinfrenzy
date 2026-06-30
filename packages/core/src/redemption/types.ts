// docs/07 — typed surface for the redemption flow.
//
// The Result types are kept here so admin handlers and player API routes
// can render meaningful error codes back to the user without a string
// match dance.

import type { SubBucket } from '../ledger/types'

export type RedemptionMethod = 'finix_ach' | 'apt_debit'

export type RedemptionStatus =
  | 'requested'
  | 'pending_review'
  | 'kyc_pending'
  | 'approved'
  | 'submitted'
  | 'awaiting_webhook'
  | 'paid'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'aml_hold'

export interface RedemptionRecord {
  id: string
  playerId: string
  amountSc: bigint
  amountUsd: bigint
  method: RedemptionMethod
  paymentInstrumentId: string | null
  status: RedemptionStatus
  drainPlan: PersistedDrainStep[]
  finixTransferId: string | null
  aptTransferId: string | null
  approvedBy: string | null
  approvedAt: Date | null
  rejectedBy: string | null
  rejectedAt: Date | null
  rejectionReason: string | null
  rejectionCategory: string | null
  failureReason: string | null
  submittedToFinixAt: Date | null
  paidAt: Date | null
  requestedAt: Date
  createdAt: Date
}

export interface PersistedDrainStep {
  bucket: SubBucket
  /** Bigint stringified — JSONB cannot hold bigint. */
  amount: string
}

export type EligibilityDenyCode =
  | 'PLAYER_NOT_FOUND'
  | 'ACCOUNT_DELETED'
  | 'ACCOUNT_CLOSED'
  | 'ACCOUNT_SUSPENDED'
  | 'SELF_EXCLUDED'
  | 'INTERNAL_ACCOUNT_NOT_REDEEMABLE'
  | 'REGISTERED_STATE_BLOCKED'
  | 'CURRENT_LOCATION_BLOCKED'
  | 'VPN_DETECTED'
  | 'KYC_LEVEL_INSUFFICIENT'
  | 'COMPLIANCE_FLAG_ACTIVE'
  | 'INSUFFICIENT_REDEEMABLE_BALANCE'
  | 'AMOUNT_BELOW_MINIMUM'
  | 'AMOUNT_ABOVE_MAXIMUM'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'WEEKLY_LIMIT_EXCEEDED'
  | 'PAYMENT_INSTRUMENT_NOT_FOUND'
  | 'PAYMENT_INSTRUMENT_DISABLED'
  | 'BANK_ACCOUNT_NOT_VALIDATED'
  | 'METHOD_NOT_SUPPORTED'

export interface EligibilityAllow {
  allowed: true
  /** True when the request must wait for KYC; the route still records the redemption. */
  requiresKyc: boolean
  /** Required KYC level the player would need; >0 only when requiresKyc. */
  requiredKycLevel: number
  redeemable: bigint
}

export interface EligibilityDeny {
  allowed: false
  code: EligibilityDenyCode
  detail?: Record<string, unknown>
}

export type EligibilityResult = EligibilityAllow | EligibilityDeny

export type RedemptionError =
  | { code: 'INELIGIBLE'; detail: EligibilityDeny }
  | { code: 'WALLET_NOT_FOUND' }
  | { code: 'LEDGER_WRITE_FAILED'; reason: string }
  | { code: 'DUPLICATE' }
  | { code: 'DATABASE_ERROR'; detail: string }

export type ApprovalError =
  | { code: 'NOT_FOUND' }
  | { code: 'INVALID_STATE'; current: RedemptionStatus }
  | { code: 'EXCEEDS_ROLE_LIMIT'; maxUsd: number }
  | { code: 'AML_HOLD_REQUIRES_MANAGER' }

export type RejectError =
  | { code: 'NOT_FOUND' }
  | { code: 'ALREADY_PAID' }
  | { code: 'INVALID_STATE'; current: RedemptionStatus }
  | { code: 'LEDGER_WRITE_FAILED'; reason: string }

export type AmlActionError =
  | { code: 'NOT_FOUND' }
  | { code: 'NOT_AML_HOLD' }
  | { code: 'INSUFFICIENT_PERMISSIONS' }

export type SubmitError =
  | { code: 'NOT_FOUND' }
  | { code: 'NOT_APPROVED'; current: RedemptionStatus }
  | { code: 'INSTRUMENT_MISSING' }
  | { code: 'INSTRUMENT_NOT_FINIX' }
  | { code: 'TRANSIENT'; reason: string }
  | { code: 'PERMANENT'; reason: string }
