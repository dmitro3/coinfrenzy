import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { assertBalanced, perCurrencyImbalance } from '../../balanced'
import type { EntrySpec, LedgerLeg, TransactionSpec } from '../../types'

// docs/04 Law 1: every transaction balances per currency. assertBalanced
// is the pure-function gate the writer relies on. Property test it.

function entry(
  partial: Partial<EntrySpec> & Pick<EntrySpec, 'leg' | 'amount' | 'currency'>,
): EntrySpec {
  return {
    accountKind: 'house_bank',
    ...partial,
  }
}

function balancedSpec(currency: 'GC' | 'SC' | 'USD'): TransactionSpec {
  return {
    source: 'admin_adjustment',
    sourceId: 'test-id',
    entries: [
      entry({ leg: 'debit', amount: 5_000n, currency }),
      entry({ leg: 'credit', amount: 5_000n, currency }),
    ],
  }
}

describe('perCurrencyImbalance', () => {
  it('returns 0 for a balanced 2-leg transaction', () => {
    const result = perCurrencyImbalance(balancedSpec('SC').entries)
    expect(result.get('SC')).toBe(0n)
  })

  it("reports non-zero diff when legs don't cancel", () => {
    const result = perCurrencyImbalance([
      entry({ leg: 'debit', amount: 100n, currency: 'SC' }),
      entry({ leg: 'credit', amount: 90n, currency: 'SC' }),
    ])
    expect(result.get('SC')).toBe(-10n) // credit 90 - debit 100
  })
})

describe('assertBalanced', () => {
  it('passes the balanced 2-leg case', () => {
    const result = assertBalanced(balancedSpec('SC'))
    expect(result.ok).toBe(true)
  })

  it('rejects an empty transaction', () => {
    const result = assertBalanced({
      source: 'admin_adjustment',
      sourceId: 'x',
      entries: [],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('empty_transaction')
  })

  it('rejects a zero-amount entry', () => {
    const result = assertBalanced({
      source: 'admin_adjustment',
      sourceId: 'x',
      entries: [
        entry({ leg: 'debit', amount: 0n, currency: 'SC' }),
        entry({ leg: 'credit', amount: 0n, currency: 'SC' }),
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid_entry')
  })

  it('rejects a negative-amount entry (sign lives on leg)', () => {
    const result = assertBalanced({
      source: 'admin_adjustment',
      sourceId: 'x',
      entries: [
        entry({ leg: 'debit', amount: -1n, currency: 'SC' }),
        entry({ leg: 'credit', amount: 1n, currency: 'SC' }),
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid_entry')
  })

  it('rejects unbalanced per-currency totals', () => {
    const result = assertBalanced({
      source: 'admin_adjustment',
      sourceId: 'x',
      entries: [
        entry({ leg: 'debit', amount: 100n, currency: 'SC' }),
        entry({ leg: 'credit', amount: 90n, currency: 'SC' }),
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('unbalanced_transaction')
      if (result.error.code === 'unbalanced_transaction') {
        expect(result.error.currency).toBe('SC')
      }
    }
  })

  // Property: any randomly-generated transaction whose per-currency credit
  // sum equals debit sum is accepted; any non-zero-summing one is rejected.
  it('property: balance-zero specs always pass; non-zero always fail', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            leg: fc.constantFrom<LedgerLeg>('debit', 'credit'),
            amount: fc.bigInt({ min: 1n, max: 10n ** 12n }),
            currency: fc.constantFrom<'GC' | 'SC' | 'USD'>('GC', 'SC', 'USD'),
          }),
          { minLength: 2, maxLength: 8 },
        ),
        (legs) => {
          const totals: Record<string, bigint> = { GC: 0n, SC: 0n, USD: 0n }
          for (const leg of legs) {
            totals[leg.currency] =
              (totals[leg.currency] ?? 0n) + (leg.leg === 'credit' ? leg.amount : -leg.amount)
          }
          const isBalanced = Object.values(totals).every((v) => v === 0n)
          const spec: TransactionSpec = {
            source: 'admin_adjustment',
            sourceId: 'prop',
            entries: legs.map((l) => entry(l)),
          }
          const result = assertBalanced(spec)
          if (isBalanced) {
            expect(result.ok).toBe(true)
          } else {
            expect(result.ok).toBe(false)
          }
        },
      ),
      { numRuns: 500 },
    )
  })
})
