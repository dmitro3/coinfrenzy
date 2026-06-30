// docs/04 §3.2 / docs/06 §10 — drain order: purchased -> earned -> promo -> bonus.
//
// Reasoning (docs/06 §10): if bonus drained first, players would never have
// to put real money in play before redeeming. Drain-bonus-LAST forces
// playthrough to actually mean something.

import type { SubBucket } from './types'

export const DRAIN_ORDER: readonly SubBucket[] = ['purchased', 'earned', 'promo', 'bonus'] as const

export interface WalletBuckets {
  purchased: bigint
  earned: bigint
  promo: bigint
  bonus: bigint
}

export interface DrainStep {
  subBucket: SubBucket
  amount: bigint
}

export interface DrainPlan {
  steps: DrainStep[]
  totalDrained: bigint
  /** True when buckets covered the requested amount; false means under-funded. */
  covered: boolean
  /** Same as buckets but post-drain, for the caller's sanity check. */
  remaining: WalletBuckets
}

/**
 * Build a drain plan for a bet/redemption. Always returns the smallest
 * number of steps that satisfies the amount (1 step when one bucket fully
 * covers; otherwise up to 4). Cross-bucket bets per docs/06 §10 fan out
 * into one debit entry per contributing sub-bucket.
 */
export function computeDrainPlan(buckets: WalletBuckets, amount: bigint): DrainPlan {
  if (amount <= 0n) {
    return {
      steps: [],
      totalDrained: 0n,
      covered: amount === 0n,
      remaining: { ...buckets },
    }
  }

  const remaining = { ...buckets }
  const steps: DrainStep[] = []
  let outstanding = amount

  for (const bucket of DRAIN_ORDER) {
    if (outstanding === 0n) break
    const available = remaining[bucket]
    if (available <= 0n) continue
    const take = available >= outstanding ? outstanding : available
    steps.push({ subBucket: bucket, amount: take })
    remaining[bucket] = available - take
    outstanding -= take
  }

  return {
    steps,
    totalDrained: amount - outstanding,
    covered: outstanding === 0n,
    remaining,
  }
}

/** docs/04 §3.6 — redemption drains earned + purchased only (NOT bonus or promo). */
export function computeRedemptionDrainPlan(buckets: WalletBuckets, amount: bigint): DrainPlan {
  const redeemableBuckets: WalletBuckets = {
    purchased: buckets.purchased,
    earned: buckets.earned,
    promo: 0n,
    bonus: 0n,
  }
  const plan = computeDrainPlan(redeemableBuckets, amount)
  // Restore the untouched buckets in the remaining view.
  plan.remaining.promo = buckets.promo
  plan.remaining.bonus = buckets.bonus
  return plan
}

/** Pure helper: redeemable balance = purchased + earned. */
export function redeemableTotal(buckets: WalletBuckets): bigint {
  return buckets.purchased + buckets.earned
}
