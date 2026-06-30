import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { bigintToNumericString, numericStringToBigint, toBigintAmount } from '../../money'

// Money helpers are the boundary between bigint (app) and numeric(20,4)
// (DB). A bug here is a silent precision loss bug. Pure unit tests with
// fast-check property cases.

describe('money helpers', () => {
  it('round-trips arbitrary bigint amounts via numeric string', () => {
    fc.assert(
      fc.property(
        fc.bigInt({
          min: -(10n ** 18n),
          max: 10n ** 18n,
        }),
        (value) => {
          const str = bigintToNumericString(value)
          const back = numericStringToBigint(str)
          expect(back).toBe(value)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('formats integer values with 4 decimal places', () => {
    expect(bigintToNumericString(10_000n)).toBe('1.0000')
    expect(bigintToNumericString(0n)).toBe('0.0000')
    expect(bigintToNumericString(1n)).toBe('0.0001')
    expect(bigintToNumericString(-1n)).toBe('-0.0001')
  })

  it('parses canonical numeric(20,4) strings', () => {
    expect(numericStringToBigint('1.0000')).toBe(10_000n)
    expect(numericStringToBigint('1.5000')).toBe(15_000n)
    expect(numericStringToBigint('0.0001')).toBe(1n)
    expect(numericStringToBigint('-12.3456')).toBe(-123_456n)
  })

  it('handles partial decimals by padding/truncating to 4 places', () => {
    expect(numericStringToBigint('1')).toBe(10_000n)
    expect(numericStringToBigint('1.5')).toBe(15_000n)
    expect(numericStringToBigint('1.12345')).toBe(11_234n) // truncates to 4 places
  })

  it('coerces strings, bigints, and numbers via toBigintAmount', () => {
    expect(toBigintAmount('1.0000')).toBe(10_000n)
    expect(toBigintAmount(10_000n)).toBe(10_000n)
    expect(toBigintAmount(1.5)).toBe(15_000n)
    expect(toBigintAmount(null)).toBe(0n)
  })
})
