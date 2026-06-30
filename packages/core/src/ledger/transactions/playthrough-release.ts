import type { CoinCurrency } from '@coinfrenzy/config'

import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.5 — playthrough release. Same account, two sub-buckets:
//   1 debit  player_wallet  amount  sub_bucket='bonus'
//   1 credit player_wallet  amount  sub_bucket='earned'
//
// This is the only transaction type where both legs hit the same account.
// Modeled as a ledger entry so the audit trail captures the exact moment
// the bonus SC became withdrawable (vs a silent UPDATE).

export interface PlaythroughReleaseSpecInput {
  /** bonuses_awarded.id — idempotency anchor. */
  bonusAwardId: string
  playerId: string
  currency: CoinCurrency
  amount: bigint
  /**
   * docs/04 §3.5 reclassifies bonus -> earned. Promo bonuses also use this
   * path; the source bucket is configurable for that case.
   */
  fromSubBucket?: 'bonus' | 'promo'
  metadata?: Record<string, unknown>
}

export function buildPlaythroughRelease(input: PlaythroughReleaseSpecInput): TransactionSpec {
  const fromBucket = input.fromSubBucket ?? 'bonus'

  const entries: EntrySpec[] = [
    {
      leg: 'debit',
      accountKind: 'player_wallet',
      amount: input.amount,
      currency: input.currency,
      playerId: input.playerId,
      subBucket: fromBucket,
    },
    {
      leg: 'credit',
      accountKind: 'player_wallet',
      amount: input.amount,
      currency: input.currency,
      playerId: input.playerId,
      subBucket: 'earned',
    },
  ]

  return {
    source: 'playthrough_release',
    sourceId: input.bonusAwardId,
    playerId: input.playerId,
    entries,
    metadata: {
      bonus_award_id: input.bonusAwardId,
      from_sub_bucket: fromBucket,
      to_sub_bucket: 'earned',
      ...(input.metadata ?? {}),
    },
  }
}
