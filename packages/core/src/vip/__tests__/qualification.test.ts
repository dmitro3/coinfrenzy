import { describe, expect, it } from 'vitest'

import { statusForLifetimeSpend } from '../qualification'

// M4 — VIP qualification thresholds. Pure function tests; no DB.

const SCALE = 10_000n

describe('statusForLifetimeSpend', () => {
  it('returns none for spend under $1000', () => {
    expect(statusForLifetimeSpend(0n)).toBe('none')
    expect(statusForLifetimeSpend(500n * SCALE)).toBe('none')
    expect(statusForLifetimeSpend(999n * SCALE)).toBe('none')
  })

  it('returns vip for spend between $1000 and $9999.99', () => {
    expect(statusForLifetimeSpend(1_000n * SCALE)).toBe('vip')
    expect(statusForLifetimeSpend(5_000n * SCALE)).toBe('vip')
    expect(statusForLifetimeSpend(9_999n * SCALE)).toBe('vip')
  })

  it('returns high_roller for spend at or over $10000', () => {
    expect(statusForLifetimeSpend(10_000n * SCALE)).toBe('high_roller')
    expect(statusForLifetimeSpend(50_000n * SCALE)).toBe('high_roller')
    expect(statusForLifetimeSpend(100_000n * SCALE)).toBe('high_roller')
  })

  it('uses the major-unit floor (does not round up)', () => {
    // $999.99 → still 'none'
    expect(statusForLifetimeSpend(999n * SCALE + 9999n)).toBe('none')
    // $1000.00 exact → 'vip'
    expect(statusForLifetimeSpend(1_000n * SCALE)).toBe('vip')
  })
})
