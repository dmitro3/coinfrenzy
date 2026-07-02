import type { CoinCurrency } from '@coinfrenzy/config'

import { computeDrainPlan, type WalletBuckets } from '../drain-order'
import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.2 — bet. Two entries when the bet draws from one sub-bucket
// (the common case), more when it crosses (docs/06 §10):
//   N debits  player_wallet  <amount/bucket>  one per drained bucket
//   1 credit  house_winnings <total>          (or sub-bucket -agnostic)
//
// Sub-bucket assignment uses the drain order purchased -> earned -> promo -> bonus.
// The house-side credit needs no sub_bucket (house accounts don't track buckets).

export interface BetSpecInput {
  /** Alea roundId (or whatever provider gave us). Idempotency anchor. */
  roundId: string
  playerId: string
  currency: CoinCurrency
  amount: bigint
  /** Live wallet bucket balances at decision time (read inside the same tx). */
  buckets: WalletBuckets
  /** True if the round was free-spin/bonus-funded (per docs/04 §3.3 note). */
  fromBonus?: boolean
  /** game_rounds.id, mirrored into metadata. */
  gameRoundId?: string | null
  metadata?: Record<string, unknown>
}

export interface BuiltBet {
  spec: TransactionSpec
  /** Echo of the drain plan so the caller can validate/log. */
  drain: ReturnType<typeof computeDrainPlan>
}

export function buildBet(input: BetSpecInput): BuiltBet {
  // Free-spin/bonus rounds always debit the 'bonus' bucket per docs/04 §3.3.
  const drainBuckets: WalletBuckets = input.fromBonus
    ? { purchased: 0n, earned: 0n, promo: 0n, bonus: input.buckets.bonus }
    : input.buckets

  const drain = computeDrainPlan(drainBuckets, input.amount)

  const entries: EntrySpec[] = []
  for (const step of drain.steps) {
    entries.push({
      leg: 'debit',
      accountKind: 'player_wallet',
      amount: step.amount,
      currency: input.currency,
      playerId: input.playerId,
      subBucket: step.subBucket,
    })
  }

  // House-side credit. Single leg, summed.
  entries.push({
    leg: 'credit',
    accountKind: input.currency === 'GC' ? 'house_winnings_gc' : 'house_winnings_sc',
    amount: drain.totalDrained,
    currency: input.currency,
  })

  const spec: TransactionSpec = {
    source: 'bet',
    sourceId: input.metadata?.tx_id ? String(input.metadata.tx_id) : input.roundId,
    playerId: input.playerId,
    entries,
    metadata: {
      round_id: input.roundId,
      game_round_id: input.gameRoundId ?? null,
      from_bonus: Boolean(input.fromBonus),
      drain: drain.steps.map((s) => ({ bucket: s.subBucket, amount: s.amount.toString() })),
      ...(input.metadata ?? {}),
    },
  }
  return { spec, drain }
}
