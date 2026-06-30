import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.8 — redemption paid (Finix confirmed cash payout). SC is
// destroyed; USD leaves house_bank to external. Four entries:
//   1 debit  pending_redemption  amount  SC
//   2 credit external             amount  SC      (SC leaves the system)
//   3 debit  house_bank           amount  USD
//   4 credit external             amount  USD     (USD leaves to player's bank)

export interface RedemptionPaidSpecInput {
  /** redemptions.id — same as the corresponding redemption_request. */
  redemptionId: string
  playerId: string
  scAmount: bigint
  usdAmount: bigint
  metadata?: Record<string, unknown>
}

export function buildRedemptionPaid(input: RedemptionPaidSpecInput): TransactionSpec {
  const entries: EntrySpec[] = [
    {
      leg: 'debit',
      accountKind: 'pending_redemption',
      amount: input.scAmount,
      currency: 'SC',
      playerId: input.playerId,
    },
    {
      leg: 'credit',
      accountKind: 'external',
      amount: input.scAmount,
      currency: 'SC',
    },
    {
      leg: 'debit',
      accountKind: 'house_bank',
      amount: input.usdAmount,
      currency: 'USD',
    },
    {
      leg: 'credit',
      accountKind: 'external',
      amount: input.usdAmount,
      currency: 'USD',
    },
  ]

  return {
    source: 'redemption_paid',
    sourceId: input.redemptionId,
    playerId: input.playerId,
    entries,
    metadata: {
      redemption_id: input.redemptionId,
      ...(input.metadata ?? {}),
    },
  }
}
