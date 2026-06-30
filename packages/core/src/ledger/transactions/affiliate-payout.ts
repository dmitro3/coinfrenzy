import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.12 — affiliate Lightning Bolt credit. SC moves from
// affiliate_payable to the affiliate's player wallet (they're a player too).
// Sub-bucket is 'earned' so it's immediately redeemable (no playthrough on
// affiliate payouts per the doc).
//
//   1 debit  affiliate_payable  amount  SC
//   2 credit player_wallet      amount  SC  sub_bucket='earned'

export interface AffiliatePayoutSpecInput {
  /** affiliate_payouts.id — idempotency anchor. */
  affiliatePayoutId: string
  /** The affiliate's own playerId (each affiliate has a player account). */
  playerId: string
  amount: bigint
  metadata?: Record<string, unknown>
}

export function buildAffiliatePayout(input: AffiliatePayoutSpecInput): TransactionSpec {
  const entries: EntrySpec[] = [
    {
      leg: 'debit',
      accountKind: 'affiliate_payable',
      amount: input.amount,
      currency: 'SC',
    },
    {
      leg: 'credit',
      accountKind: 'player_wallet',
      amount: input.amount,
      currency: 'SC',
      playerId: input.playerId,
      subBucket: 'earned',
    },
  ]

  return {
    source: 'affiliate_payout',
    sourceId: input.affiliatePayoutId,
    playerId: input.playerId,
    entries,
    metadata: {
      affiliate_payout_id: input.affiliatePayoutId,
      ...(input.metadata ?? {}),
    },
  }
}
