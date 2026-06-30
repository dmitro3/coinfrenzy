import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { applyWeightToAmount, computeGameWeight, type GameForWeight } from '../game-weight'

// docs/06 §7 — override precedence: game id > category > bonus default
// > game default. And the math helper.

const slot: GameForWeight = { id: 'g-slot', category: 'slots', playthroughWeight: 1.0 }
const table: GameForWeight = { id: 'g-bj', category: 'table', playthroughWeight: 0.25 }
const live: GameForWeight = { id: 'g-live', category: 'live', playthroughWeight: 0.1 }

describe('computeGameWeight', () => {
  it('falls back to the game default when no override applies', () => {
    expect(computeGameWeight({ gameWeightOverridesSnapshot: null }, slot)).toBe(1)
    expect(computeGameWeight({ gameWeightOverridesSnapshot: null }, table)).toBe(0.25)
    expect(computeGameWeight({ gameWeightOverridesSnapshot: null }, live)).toBeCloseTo(0.1)
  })

  it('uses a category override when present', () => {
    const overrides = { slots: 1.0, table: 0.5, default: 0 }
    expect(computeGameWeight({ gameWeightOverridesSnapshot: overrides }, slot)).toBe(1.0)
    expect(computeGameWeight({ gameWeightOverridesSnapshot: overrides }, table)).toBe(0.5)
    // live falls through to the per-bonus default = 0
    expect(computeGameWeight({ gameWeightOverridesSnapshot: overrides }, live)).toBe(0)
  })

  it('per-game override beats category override', () => {
    const overrides = { slots: 1.0, 'game:g-slot': 0.3 }
    expect(computeGameWeight({ gameWeightOverridesSnapshot: overrides }, slot)).toBeCloseTo(0.3)
  })

  it('clamps weights to [0, 1]', () => {
    expect(computeGameWeight({ gameWeightOverridesSnapshot: { slots: 2.5 } }, slot)).toBe(1)
    expect(computeGameWeight({ gameWeightOverridesSnapshot: { slots: -0.5 } }, slot)).toBe(0)
  })

  it('tolerates string-typed weights (legacy JSONB shape)', () => {
    expect(computeGameWeight({ gameWeightOverridesSnapshot: { slots: '0.75' } }, slot)).toBeCloseTo(
      0.75,
    )
  })
})

describe('applyWeightToAmount', () => {
  it('passes amounts through unchanged at weight 1', () => {
    expect(applyWeightToAmount(123_456n, 1)).toBe(123_456n)
  })
  it('returns 0 at weight 0', () => {
    expect(applyWeightToAmount(123_456n, 0)).toBe(0n)
  })
  it('matches integer-arithmetic expectation at known weights', () => {
    // 0.25 * 100_0000 = 25_0000 minor units = $25.00 contribution from $100.00 bet
    expect(applyWeightToAmount(100_0000n, 0.25)).toBe(25_0000n)
    expect(applyWeightToAmount(33_3333n, 0.5)).toBe(16_6666n) // floor
  })

  it('property: weighted contribution never exceeds the bet', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 14n }),
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        (amount, weight) => {
          const result = applyWeightToAmount(amount, weight)
          return result <= amount && result >= 0n
        },
      ),
    )
  })

  it('property: weight 0 always yields 0; weight 1 always yields amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 14n }), (amount) => {
        return applyWeightToAmount(amount, 0) === 0n && applyWeightToAmount(amount, 1) === amount
      }),
    )
  })
})
