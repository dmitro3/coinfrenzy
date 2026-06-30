import type { CoinCurrency } from '@coinfrenzy/config'

import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.4 — bonus award. Two entries:
//   1 debit  bonus_pool_*   <amount>
//   1 credit player_wallet  <amount>  sub_bucket = 'bonus' (or 'promo' for promo codes)
//
// The wallet playthrough fields are bumped by the bonus engine in the same
// transaction; this builder only handles the ledger side.

export interface BonusAwardSpecInput {
  /** bonuses_awarded.id — idempotency anchor. */
  bonusAwardId: string
  playerId: string
  currency: CoinCurrency
  amount: bigint
  /** 'bonus' (default) for tier/welcome/etc; 'promo' for promo-code awards. */
  subBucket?: 'bonus' | 'promo'
  metadata?: Record<string, unknown>
}

export function buildBonusAward(input: BonusAwardSpecInput): TransactionSpec {
  const poolAccount = input.currency === 'GC' ? 'bonus_pool_gc' : 'bonus_pool_sc'
  const subBucket = input.subBucket ?? 'bonus'

  const entries: EntrySpec[] = [
    {
      leg: 'debit',
      accountKind: poolAccount,
      amount: input.amount,
      currency: input.currency,
    },
    {
      leg: 'credit',
      accountKind: 'player_wallet',
      amount: input.amount,
      currency: input.currency,
      playerId: input.playerId,
      subBucket,
    },
  ]

  return {
    source: 'bonus_award',
    sourceId: input.bonusAwardId,
    playerId: input.playerId,
    entries,
    metadata: {
      bonus_award_id: input.bonusAwardId,
      ...(input.metadata ?? {}),
    },
  }
}
