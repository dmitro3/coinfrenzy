import type { TransactionSpec, EntrySpec, SubBucket } from '../types'

// docs/04 §3.1 — purchase. 6 entries per package per the doc:
//   1) debit  external          USD  amount_usd          (player's bank)
//   2) credit house_bank        USD  amount_usd          (our settlement)
//   3) debit  house_winnings_gc GC   total_gc_awarded    (we fund GC)
//   4) credit player_wallet GC GC   total_gc_awarded
//   5) debit  house_winnings_sc SC   total_sc_awarded    (we fund SC)
//   6) credit player_wallet SC SC   total_sc_awarded
//
// SC sub-bucket assignment per the doc:
//   - free SC with the package -> 'purchased' (1x playthrough)
//   - bonus SC from bonuses.id  -> 'bonus'    (per bonus's multiplier)
//   - promo SC                  -> 'promo'
// We split the credit leg into one entry per sub-bucket; the debit on
// house_winnings_sc collapses to one leg (sum of the splits) so the per-
// currency balance still holds.
//
// `isInternalAccount` routes the player credit to `internal_account_sink`
// per docs/04 §3.1 — accounting still balances; GGR/NGR queries exclude.

export interface PurchaseScSplit {
  /** Free SC bundled with the coin package. */
  purchased: bigint
  /** SC granted by a linked bonus row (3x playthrough by default). */
  bonus: bigint
  /** SC granted by a redeemed promo code. */
  promo: bigint
}

export interface PurchaseSpecInput {
  /** Idempotency anchor — typically Finix transfer.id. */
  finixTransferId: string
  /** Our purchases.id, mirrored into metadata for joins. */
  purchaseId: string
  playerId: string
  isInternalAccount?: boolean
  amountUsd: bigint
  /** Total GC credited to the player (no sub-bucket — GC has none). */
  gcAwarded: bigint
  scSplit: PurchaseScSplit
  metadata?: Record<string, unknown>
}

function totalScAwarded(split: PurchaseScSplit): bigint {
  return split.purchased + split.bonus + split.promo
}

export function buildPurchase(input: PurchaseSpecInput): TransactionSpec {
  const totalSc = totalScAwarded(input.scSplit)
  const playerAccountKind = input.isInternalAccount ? 'internal_account_sink' : 'player_wallet'

  const entries: EntrySpec[] = [
    // USD flow: external -> house_bank
    {
      leg: 'debit',
      accountKind: 'external',
      amount: input.amountUsd,
      currency: 'USD',
    },
    {
      leg: 'credit',
      accountKind: 'house_bank',
      amount: input.amountUsd,
      currency: 'USD',
    },
  ]

  // GC flow: house_winnings_gc -> player_wallet GC (or internal sink)
  if (input.gcAwarded > 0n) {
    entries.push({
      leg: 'debit',
      accountKind: 'house_winnings_gc',
      amount: input.gcAwarded,
      currency: 'GC',
    })
    entries.push({
      leg: 'credit',
      accountKind: playerAccountKind,
      amount: input.gcAwarded,
      currency: 'GC',
      playerId: input.playerId,
      // GC has no playthrough -> default sub_bucket is 'purchased'.
      subBucket: 'purchased',
    })
  }

  // SC flow: house_winnings_sc -> player_wallet SC, split by sub-bucket.
  if (totalSc > 0n) {
    entries.push({
      leg: 'debit',
      accountKind: 'house_winnings_sc',
      amount: totalSc,
      currency: 'SC',
    })

    for (const [bucket, amount] of Object.entries(input.scSplit) as [SubBucket, bigint][]) {
      if (amount > 0n) {
        entries.push({
          leg: 'credit',
          accountKind: playerAccountKind,
          amount,
          currency: 'SC',
          playerId: input.playerId,
          subBucket: bucket,
        })
      }
    }
  }

  return {
    source: 'purchase',
    sourceId: input.finixTransferId,
    playerId: input.playerId,
    entries,
    metadata: {
      purchase_id: input.purchaseId,
      ...(input.metadata ?? {}),
    },
  }
}
