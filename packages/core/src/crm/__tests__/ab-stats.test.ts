import { describe, expect, it } from 'vitest'

import { abSignificance } from '../ab-stats'

describe('ab significance', () => {
  it('reports insufficient data when arms are too small', () => {
    const r = abSignificance({ n: 10, successes: 1 }, { n: 12, successes: 4 })
    expect(r.significantAt95).toBe(false)
    expect(r.summary).toContain('Need at least')
  })

  it('detects a clear B-winner', () => {
    const r = abSignificance({ n: 1000, successes: 100 }, { n: 1000, successes: 200 })
    expect(r.winner).toBe('B')
    expect(r.significantAt95).toBe(true)
    expect(r.pValue).not.toBeNull()
    expect(r.pValue!).toBeLessThan(0.05)
  })

  it('reports tie when both rates equal', () => {
    const r = abSignificance({ n: 200, successes: 50 }, { n: 200, successes: 50 })
    expect(r.winner).toBe('tie')
    expect(r.significantAt95).toBe(false)
  })

  it('does not call a marginal difference significant', () => {
    const r = abSignificance({ n: 200, successes: 20 }, { n: 200, successes: 22 })
    expect(r.significantAt95).toBe(false)
  })

  it('returns null pValue when standard error is zero', () => {
    const r = abSignificance({ n: 100, successes: 0 }, { n: 100, successes: 0 })
    expect(r.pValue).toBeNull()
    expect(r.winner).toBe('tie')
  })
})
