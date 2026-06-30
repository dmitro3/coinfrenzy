import { describe, expect, it } from 'vitest'

import { noopLogger, createAfterCommitQueue, type Context } from '@coinfrenzy/core'

import { computeAwardAmounts, type BonusForCompute } from '../compute-amount'

// We don't need a real DB for the static-amount + streak formula branches.
// The tier_match and tier_pct paths call into tierProgress; those are
// covered in the integration test.

function makeCtx(): Context {
  const queue = createAfterCommitQueue(noopLogger)
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    } as unknown as Context['db'],
    logger: noopLogger,
    actor: { kind: 'system', service: 'script', source: 'tests' },
    reqId: 'test',
    afterCommit: queue.push,
  }
}

describe('computeAwardAmounts', () => {
  it('returns static amounts when present', async () => {
    const bonus: BonusForCompute = { awardGc: 10_000n, awardSc: 5_000n, awardFormula: null }
    const result = await computeAwardAmounts(makeCtx(), bonus, 'p1')
    expect(result).toEqual({ gc: 10_000n, sc: 5_000n })
  })

  it('returns zero when no static amount and no formula', async () => {
    const bonus: BonusForCompute = { awardGc: 0n, awardSc: 0n, awardFormula: null }
    expect(await computeAwardAmounts(makeCtx(), bonus, 'p1')).toEqual({ gc: 0n, sc: 0n })
  })

  it('applies pct_of_purchase to context.purchaseAmount', async () => {
    const bonus: BonusForCompute = {
      awardGc: 0n,
      awardSc: 0n,
      awardFormula: { type: 'pct_of_purchase', pct: 0.2, currency: 'SC' },
    }
    // $50.00 purchase = 50_0000 minor → 20% = 10_0000 minor SC
    const result = await computeAwardAmounts(makeCtx(), bonus, 'p1', {
      purchaseAmount: 50_0000n,
    })
    expect(result).toEqual({ gc: 0n, sc: 10_0000n })
  })

  it('returns zero from pct_of_purchase when context is missing', async () => {
    const bonus: BonusForCompute = {
      awardGc: 0n,
      awardSc: 0n,
      awardFormula: { type: 'pct_of_purchase', pct: 0.2 },
    }
    expect(await computeAwardAmounts(makeCtx(), bonus, 'p1')).toEqual({ gc: 0n, sc: 0n })
  })

  it('applies fixed_with_streak_multiplier and clamps to max_streak', async () => {
    const bonus: BonusForCompute = {
      awardGc: 0n,
      awardSc: 0n,
      awardFormula: { type: 'fixed_with_streak_multiplier', base_sc: 5_000, max_streak: 7 },
    }
    const day1 = await computeAwardAmounts(makeCtx(), bonus, 'p1', { streak: 1 })
    expect(day1).toEqual({ gc: 0n, sc: 5_000n })

    const day5 = await computeAwardAmounts(makeCtx(), bonus, 'p1', { streak: 5 })
    expect(day5).toEqual({ gc: 0n, sc: 25_000n })

    const day99 = await computeAwardAmounts(makeCtx(), bonus, 'p1', { streak: 99 })
    expect(day99).toEqual({ gc: 0n, sc: 35_000n }) // capped at max_streak=7
  })

  it('falls back to zero on an unknown formula type', async () => {
    const bonus: BonusForCompute = {
      awardGc: 0n,
      awardSc: 0n,
      awardFormula: { type: 'martingale_double' as never },
    }
    expect(await computeAwardAmounts(makeCtx(), bonus, 'p1')).toEqual({ gc: 0n, sc: 0n })
  })
})
