import type { SubBucket, EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.9 — redemption rejected. SC returns from pending_redemption to
// the player wallet, restored to the ORIGINAL sub-bucket split (preserved
// on the redemption record so we know which bucket each portion came from).
//
//   1 debit  pending_redemption  total       SC
//   N credit player_wallet       per-bucket  SC  (one per restored sub_bucket)

export interface RejectedSplit {
  subBucket: SubBucket
  amount: bigint
}

export interface RedemptionRejectedSpecInput {
  /** redemptions.id — same as the corresponding redemption_request. */
  redemptionId: string
  playerId: string
  /** Original drain split persisted from the request. Must sum to >0. */
  splits: RejectedSplit[]
  metadata?: Record<string, unknown>
}

export function buildRedemptionRejected(input: RedemptionRejectedSpecInput): TransactionSpec {
  const total = input.splits.reduce((sum, s) => sum + s.amount, 0n)

  const entries: EntrySpec[] = [
    {
      leg: 'debit',
      accountKind: 'pending_redemption',
      amount: total,
      currency: 'SC',
      playerId: input.playerId,
    },
  ]
  for (const split of input.splits) {
    if (split.amount <= 0n) continue
    entries.push({
      leg: 'credit',
      accountKind: 'player_wallet',
      amount: split.amount,
      currency: 'SC',
      playerId: input.playerId,
      subBucket: split.subBucket,
    })
  }

  return {
    source: 'redemption_rejected',
    sourceId: input.redemptionId,
    playerId: input.playerId,
    entries,
    metadata: {
      redemption_id: input.redemptionId,
      restore: input.splits.map((s) => ({ bucket: s.subBucket, amount: s.amount.toString() })),
      ...(input.metadata ?? {}),
    },
  }
}
