import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.10 — purchase_refund. Chargeback/reversal. 6 entries:
//   1 debit  player_wallet GC    gc_to_claw_back   (player loses GC)
//   2 credit house_winnings_gc   gc_to_claw_back
//   3 debit  player_wallet SC    sc_to_claw_back
//   4 credit house_winnings_sc   sc_to_claw_back
//   5 debit  house_bank          amount_usd
//   6 credit external            amount_usd        (USD goes back to player)
//
// Per docs/04 §3.10: if the player has already spent the SC/GC we're
// clawing back, the wallet balance can go negative. We allow that and the
// caller (purchases module) flags compliance. This builder does NOT
// enforce a non-negative balance; that's a separate layer.

export interface PurchaseRefundSpecInput {
  /** Refund/dispute id — idempotency anchor (chargeback case id from Finix or our refunds.id). */
  refundId: string
  /** Original purchases.id, mirrored into metadata. */
  purchaseId: string
  playerId: string
  /** GC originally awarded (and now clawed back). 0n if no GC was in the purchase. */
  gcToClawBack: bigint
  /** SC originally awarded across all sub-buckets (clawed proportionally). 0n if no SC. */
  scClawBackBySubBucket: { purchased: bigint; bonus: bigint; promo: bigint }
  usdAmount: bigint
  metadata?: Record<string, unknown>
}

export function buildPurchaseRefund(input: PurchaseRefundSpecInput): TransactionSpec {
  const entries: EntrySpec[] = []

  if (input.gcToClawBack > 0n) {
    entries.push({
      leg: 'debit',
      accountKind: 'player_wallet',
      amount: input.gcToClawBack,
      currency: 'GC',
      playerId: input.playerId,
      // GC has no sub-bucket distinction; we use 'purchased' to mirror the
      // original credit's sub_bucket.
      subBucket: 'purchased',
    })
    entries.push({
      leg: 'credit',
      accountKind: 'house_winnings_gc',
      amount: input.gcToClawBack,
      currency: 'GC',
    })
  }

  const scTotal =
    input.scClawBackBySubBucket.purchased +
    input.scClawBackBySubBucket.bonus +
    input.scClawBackBySubBucket.promo

  if (scTotal > 0n) {
    for (const bucket of ['purchased', 'bonus', 'promo'] as const) {
      const amount = input.scClawBackBySubBucket[bucket]
      if (amount > 0n) {
        entries.push({
          leg: 'debit',
          accountKind: 'player_wallet',
          amount,
          currency: 'SC',
          playerId: input.playerId,
          subBucket: bucket,
        })
      }
    }
    entries.push({
      leg: 'credit',
      accountKind: 'house_winnings_sc',
      amount: scTotal,
      currency: 'SC',
    })
  }

  // USD flow back to the player.
  entries.push({
    leg: 'debit',
    accountKind: 'house_bank',
    amount: input.usdAmount,
    currency: 'USD',
  })
  entries.push({
    leg: 'credit',
    accountKind: 'external',
    amount: input.usdAmount,
    currency: 'USD',
  })

  return {
    source: 'purchase_refund',
    sourceId: input.refundId,
    playerId: input.playerId,
    entries,
    metadata: {
      refund_id: input.refundId,
      purchase_id: input.purchaseId,
      ...(input.metadata ?? {}),
    },
  }
}
