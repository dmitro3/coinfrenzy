import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  computeDrainPlan,
  computeRedemptionDrainPlan,
  DRAIN_ORDER,
  redeemableTotal,
  type WalletBuckets,
} from '../../drain-order'

// docs/04 §3.2 / docs/06 §10 — drain order: purchased -> earned -> promo -> bonus.

describe('computeDrainPlan', () => {
  const buckets: WalletBuckets = {
    purchased: 10_000n,
    earned: 5_000n,
    promo: 2_000n,
    bonus: 8_000n,
  }

  it('drains entirely from purchased when sufficient', () => {
    const plan = computeDrainPlan(buckets, 5_000n)
    expect(plan.steps).toEqual([{ subBucket: 'purchased', amount: 5_000n }])
    expect(plan.totalDrained).toBe(5_000n)
    expect(plan.covered).toBe(true)
  })

  it('cascades to earned when purchased is exhausted', () => {
    const plan = computeDrainPlan(buckets, 13_000n)
    expect(plan.steps).toEqual([
      { subBucket: 'purchased', amount: 10_000n },
      { subBucket: 'earned', amount: 3_000n },
    ])
  })

  it('drains in the exact docs/04 order: purchased -> earned -> promo -> bonus', () => {
    const plan = computeDrainPlan(buckets, 25_000n)
    expect(plan.steps.map((s) => s.subBucket)).toEqual(DRAIN_ORDER)
    expect(plan.totalDrained).toBe(25_000n)
    expect(plan.remaining).toEqual({ purchased: 0n, earned: 0n, promo: 0n, bonus: 0n })
  })

  it('flags covered=false when buckets cannot fund the amount', () => {
    const plan = computeDrainPlan(buckets, 50_000n)
    expect(plan.covered).toBe(false)
    expect(plan.totalDrained).toBe(25_000n) // all of it
  })

  it('returns no steps for zero amount', () => {
    const plan = computeDrainPlan(buckets, 0n)
    expect(plan.steps).toHaveLength(0)
    expect(plan.covered).toBe(true)
  })

  // Property: drain order is invariant — for any non-zero buckets and any
  // amount <= total, the plan never draws from bonus before all of
  // {purchased, earned, promo} are zero.
  it('property: bonus is always drained LAST', () => {
    fc.assert(
      fc.property(
        fc.record({
          purchased: fc.bigInt({ min: 0n, max: 10n ** 9n }),
          earned: fc.bigInt({ min: 0n, max: 10n ** 9n }),
          promo: fc.bigInt({ min: 0n, max: 10n ** 9n }),
          bonus: fc.bigInt({ min: 0n, max: 10n ** 9n }),
        }),
        fc.bigInt({ min: 1n, max: 10n ** 10n }),
        (input: WalletBuckets, amount: bigint) => {
          const plan = computeDrainPlan(input, amount)
          const drainedBonus = plan.steps.find((s) => s.subBucket === 'bonus')
          if (drainedBonus) {
            // If we touched bonus, the other three must have been fully exhausted.
            expect(plan.remaining.purchased).toBe(0n)
            expect(plan.remaining.earned).toBe(0n)
            expect(plan.remaining.promo).toBe(0n)
          }
          // Sum of steps equals totalDrained, never exceeds amount or buckets.
          const sum = plan.steps.reduce((acc, s) => acc + s.amount, 0n)
          expect(sum).toBe(plan.totalDrained)
          expect(plan.totalDrained <= amount).toBe(true)
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('computeRedemptionDrainPlan', () => {
  it('only uses purchased + earned, even when bonus/promo are available', () => {
    const buckets: WalletBuckets = {
      purchased: 1_000n,
      earned: 2_000n,
      promo: 999_999n,
      bonus: 999_999n,
    }
    const plan = computeRedemptionDrainPlan(buckets, 2_500n)
    expect(plan.steps.map((s) => s.subBucket)).toEqual(['purchased', 'earned'])
    expect(plan.totalDrained).toBe(2_500n)
    // Non-redeemable buckets are preserved in remaining view.
    expect(plan.remaining.promo).toBe(999_999n)
    expect(plan.remaining.bonus).toBe(999_999n)
  })

  it('flags uncovered when redeemable cannot fund the amount', () => {
    const buckets: WalletBuckets = {
      purchased: 100n,
      earned: 200n,
      promo: 999n,
      bonus: 999n,
    }
    const plan = computeRedemptionDrainPlan(buckets, 1_000n)
    expect(plan.covered).toBe(false)
    expect(plan.totalDrained).toBe(300n)
  })
})

describe('redeemableTotal', () => {
  it('= purchased + earned, excluding promo/bonus', () => {
    expect(redeemableTotal({ purchased: 5n, earned: 3n, promo: 100n, bonus: 100n })).toBe(8n)
  })
})
