import type { CoinCurrency } from '@coinfrenzy/config'

import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.3 — win. Two entries:
//   1 debit  house_winnings <amount>
//   1 credit player_wallet  <amount>  sub_bucket = 'earned'
//
// Win sub-bucket is ALWAYS 'earned' per the doc, even when the underlying
// bet was funded from bonus (free spins). That's deliberate: winnings from
// bonus play accumulate in 'earned' so they can be redeemed after
// playthrough completes on the originating bonus.

export interface WinSpecInput {
  /** Alea roundId. MUST match the bet's roundId so docs/04 §9.6 holds. */
  roundId: string
  playerId: string
  currency: CoinCurrency
  amount: bigint
  /** game_rounds.id mirrored into metadata. */
  gameRoundId?: string | null
  metadata?: Record<string, unknown>
}

export function buildWin(input: WinSpecInput): TransactionSpec {
  const houseAccount = input.currency === 'GC' ? 'house_winnings_gc' : 'house_winnings_sc'

  const entries: EntrySpec[] = [
    {
      leg: 'debit',
      accountKind: houseAccount,
      amount: input.amount,
      currency: input.currency,
    },
    {
      leg: 'credit',
      accountKind: 'player_wallet',
      amount: input.amount,
      currency: input.currency,
      playerId: input.playerId,
      // docs/04 §3.3 — wins always land in 'earned'.
      subBucket: 'earned',
    },
  ]

  return {
    source: 'win',
    sourceId: input.roundId,
    playerId: input.playerId,
    entries,
    metadata: {
      round_id: input.roundId,
      game_round_id: input.gameRoundId ?? null,
      ...(input.metadata ?? {}),
    },
  }
}
