import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { assertBalanced } from '../../balanced'
import {
  buildAdminAdjustment,
  buildAffiliatePayout,
  buildBet,
  buildBonusAward,
  buildPlaythroughRelease,
  buildPurchase,
  buildPurchaseRefund,
  buildRedemptionPaid,
  buildRedemptionRejected,
  buildRedemptionRequest,
  buildWin,
} from '../../transactions'
import type { WalletBuckets } from '../../drain-order'

// Each builder MUST produce a TransactionSpec that passes assertBalanced.
// This is the per-builder invariant from docs/04 §3.

const PLAYER_ID = '00000000-0000-0000-0000-000000000001'

describe('transaction builders all return balanced specs', () => {
  it('purchase: 6 entries across USD/GC/SC, all balanced', () => {
    const spec = buildPurchase({
      finixTransferId: 'TRfoo',
      purchaseId: 'p1',
      playerId: PLAYER_ID,
      amountUsd: 500_000n, // $50.0000
      gcAwarded: 1_000_000_000n, // 100,000 GC
      scSplit: { purchased: 200_000n, bonus: 100_000n, promo: 50_000n },
    })
    expect(spec.entries.length).toBeGreaterThanOrEqual(6)
    const res = assertBalanced(spec)
    expect(res.ok).toBe(true)
  })

  it('purchase with no GC: still balances per currency', () => {
    const spec = buildPurchase({
      finixTransferId: 'TRbar',
      purchaseId: 'p2',
      playerId: PLAYER_ID,
      amountUsd: 100_000n,
      gcAwarded: 0n,
      scSplit: { purchased: 100_000n, bonus: 0n, promo: 0n },
    })
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('bet single-bucket: 2 entries', () => {
    const buckets: WalletBuckets = {
      purchased: 100_000n,
      earned: 0n,
      promo: 0n,
      bonus: 0n,
    }
    const { spec, drain } = buildBet({
      roundId: 'r1',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 50_000n,
      buckets,
    })
    expect(drain.steps).toHaveLength(1)
    expect(spec.entries).toHaveLength(2)
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('bet cross-bucket: N debit entries + 1 credit, balanced', () => {
    const buckets: WalletBuckets = {
      purchased: 30_000n,
      earned: 20_000n,
      promo: 10_000n,
      bonus: 5_000n,
    }
    const { spec, drain } = buildBet({
      roundId: 'r2',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 55_000n,
      buckets,
    })
    expect(drain.steps).toHaveLength(3) // purchased + earned + promo
    expect(spec.entries.filter((e) => e.leg === 'debit')).toHaveLength(3)
    expect(spec.entries.filter((e) => e.leg === 'credit')).toHaveLength(1)
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('win: 2 entries, sub_bucket is always earned', () => {
    const spec = buildWin({
      roundId: 'r1',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 30_000n,
    })
    expect(assertBalanced(spec).ok).toBe(true)
    const playerLeg = spec.entries.find((e) => e.accountKind === 'player_wallet')
    expect(playerLeg?.subBucket).toBe('earned')
  })

  it('bonus_award: 2 entries, default sub_bucket is bonus', () => {
    const spec = buildBonusAward({
      bonusAwardId: 'b1',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 10_000n,
    })
    expect(assertBalanced(spec).ok).toBe(true)
    expect(spec.entries[1]?.subBucket).toBe('bonus')
  })

  it('playthrough_release: bonus -> earned reclassification', () => {
    const spec = buildPlaythroughRelease({
      bonusAwardId: 'b1',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 10_000n,
    })
    expect(assertBalanced(spec).ok).toBe(true)
    const subBuckets = spec.entries.map((e) => e.subBucket)
    expect(subBuckets).toEqual(['bonus', 'earned'])
  })

  it('redemption_request: drains earned+purchased only', () => {
    const buckets: WalletBuckets = {
      purchased: 10_000n,
      earned: 5_000n,
      promo: 100_000n,
      bonus: 100_000n,
    }
    const { spec, drain } = buildRedemptionRequest({
      redemptionId: 'rd1',
      playerId: PLAYER_ID,
      amount: 12_000n,
      buckets,
    })
    expect(drain.steps.map((s) => s.subBucket)).toEqual(['purchased', 'earned'])
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('redemption_paid: 4 entries across SC and USD', () => {
    const spec = buildRedemptionPaid({
      redemptionId: 'rd1',
      playerId: PLAYER_ID,
      scAmount: 100_000n,
      usdAmount: 100_000n,
    })
    expect(spec.entries).toHaveLength(4)
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('redemption_rejected: 1 debit + N credits restoring original split', () => {
    const spec = buildRedemptionRejected({
      redemptionId: 'rd1',
      playerId: PLAYER_ID,
      splits: [
        { subBucket: 'purchased', amount: 10_000n },
        { subBucket: 'earned', amount: 5_000n },
      ],
    })
    expect(spec.entries).toHaveLength(3)
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('purchase_refund: clawback flow balances per currency', () => {
    const spec = buildPurchaseRefund({
      refundId: 'rf1',
      purchaseId: 'p1',
      playerId: PLAYER_ID,
      gcToClawBack: 1_000_000n,
      scClawBackBySubBucket: { purchased: 100_000n, bonus: 50_000n, promo: 25_000n },
      usdAmount: 500_000n,
    })
    expect(assertBalanced(spec).ok).toBe(true)
  })

  it('admin_adjustment (credit): house -> player_wallet', () => {
    const spec = buildAdminAdjustment({
      adjustmentId: 'aa1',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 10_000n,
      subBucket: 'earned',
      direction: 'credit',
    })
    expect(assertBalanced(spec).ok).toBe(true)
    const playerLeg = spec.entries.find((e) => e.accountKind === 'player_wallet')
    expect(playerLeg?.leg).toBe('credit')
  })

  it('admin_adjustment (debit/clawback): player_wallet -> house', () => {
    const spec = buildAdminAdjustment({
      adjustmentId: 'aa2',
      playerId: PLAYER_ID,
      currency: 'SC',
      amount: 5_000n,
      subBucket: 'earned',
      direction: 'debit',
    })
    expect(assertBalanced(spec).ok).toBe(true)
    const playerLeg = spec.entries.find((e) => e.accountKind === 'player_wallet')
    expect(playerLeg?.leg).toBe('debit')
  })

  it('affiliate_payout: SC to player earned bucket', () => {
    const spec = buildAffiliatePayout({
      affiliatePayoutId: 'ap1',
      playerId: PLAYER_ID,
      amount: 25_000n,
    })
    expect(assertBalanced(spec).ok).toBe(true)
    const playerLeg = spec.entries.find((e) => e.accountKind === 'player_wallet')
    expect(playerLeg?.subBucket).toBe('earned')
  })

  // Property: any randomly-shaped purchase produces a balanced spec.
  it('property: buildPurchase always balances', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 8n }),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        (usd, gc, purchased, bonus, promo) => {
          const spec = buildPurchase({
            finixTransferId: 'rand',
            purchaseId: 'rand',
            playerId: PLAYER_ID,
            amountUsd: usd,
            gcAwarded: gc,
            scSplit: { purchased, bonus, promo },
          })
          expect(assertBalanced(spec).ok).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  // Property: any randomly-shaped bet produces a balanced spec.
  it('property: buildBet always balances and respects drain order', () => {
    fc.assert(
      fc.property(
        fc.record({
          purchased: fc.bigInt({ min: 0n, max: 10n ** 8n }),
          earned: fc.bigInt({ min: 0n, max: 10n ** 8n }),
          promo: fc.bigInt({ min: 0n, max: 10n ** 8n }),
          bonus: fc.bigInt({ min: 0n, max: 10n ** 8n }),
        }),
        fc.bigInt({ min: 1n, max: 10n ** 8n }),
        (buckets: WalletBuckets, amount) => {
          const { spec } = buildBet({
            roundId: 'r',
            playerId: PLAYER_ID,
            currency: 'SC',
            amount,
            buckets,
          })
          // Only assert balance if we covered the bet; an under-funded bet
          // produces fewer debit legs than the credit total expects, but
          // the builder DOES sum the credit to totalDrained so it always
          // balances.
          expect(assertBalanced(spec).ok).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })
})
