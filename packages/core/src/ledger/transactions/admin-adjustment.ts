import type { CoinCurrency } from '@coinfrenzy/config'

import type { EntrySpec, LedgerAccountKind, SubBucket, TransactionSpec } from '../types'

// docs/04 §3.11 — admin_adjustment. Manual coin grant or clawback by a
// master admin. Two entries:
//   1 debit  source_account     amount  currency
//   2 credit player_wallet      amount  currency
// (or reversed for clawbacks).
//
// `source_account` is typically bonus_pool_* for grants and house_winnings_*
// for goodwill comp; the builder accepts both for flexibility.

export type AdjustmentDirection = 'credit' | 'debit'

export interface AdminAdjustmentSpecInput {
  /** admin_adjustments.id — idempotency anchor. */
  adjustmentId: string
  playerId: string
  currency: CoinCurrency
  amount: bigint
  subBucket: SubBucket
  /** 'credit' = grant to player, 'debit' = clawback from player. */
  direction: AdjustmentDirection
  /** Where the coins come FROM (grant) or GO TO (clawback). */
  counterpartyAccount?: LedgerAccountKind
  metadata?: Record<string, unknown>
}

function defaultCounterparty(currency: CoinCurrency, subBucket: SubBucket): LedgerAccountKind {
  // Grants drawn from bonus_pool_* by default; clawback caller may override.
  if (subBucket === 'bonus' || subBucket === 'promo') {
    return currency === 'GC' ? 'bonus_pool_gc' : 'bonus_pool_sc'
  }
  return currency === 'GC' ? 'house_winnings_gc' : 'house_winnings_sc'
}

export function buildAdminAdjustment(input: AdminAdjustmentSpecInput): TransactionSpec {
  const counterparty =
    input.counterpartyAccount ?? defaultCounterparty(input.currency, input.subBucket)

  const isCredit = input.direction === 'credit'
  const playerLeg: EntrySpec = {
    leg: isCredit ? 'credit' : 'debit',
    accountKind: 'player_wallet',
    amount: input.amount,
    currency: input.currency,
    playerId: input.playerId,
    subBucket: input.subBucket,
  }
  const houseLeg: EntrySpec = {
    leg: isCredit ? 'debit' : 'credit',
    accountKind: counterparty,
    amount: input.amount,
    currency: input.currency,
  }

  return {
    source: 'admin_adjustment',
    sourceId: input.adjustmentId,
    playerId: input.playerId,
    entries: [houseLeg, playerLeg],
    metadata: {
      adjustment_id: input.adjustmentId,
      direction: input.direction,
      counterparty,
      sub_bucket: input.subBucket,
      ...(input.metadata ?? {}),
    },
  }
}
