// Money helpers for the ledger boundary. Per docs/02 §4 and .cursorrules:
//   - Money in TS is bigint, in MINOR units (1 SC = 10_000n).
//   - Money in PG is numeric(20,4).
//   - The bridge (toDriver/fromDriver) lives on the `money` customType in
//     packages/db/src/schema/_shared.ts. These helpers are for code that has
//     to do its own raw-SQL boundary work (e.g. reconciliation views that
//     project SUM(amount) where Drizzle's customType doesn't apply).

import { MINOR_UNITS_PER_MAJOR } from '@coinfrenzy/config'

/** Format a bigint (minor units) as a numeric(20,4) literal string ("12.3456"). */
export function bigintToNumericString(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / MINOR_UNITS_PER_MAJOR
  const minor = abs % MINOR_UNITS_PER_MAJOR
  return `${negative ? '-' : ''}${major}.${minor.toString().padStart(4, '0')}`
}

/** Parse a numeric(20,4) string ("12.3456") back to bigint minor units. */
export function numericStringToBigint(value: string): bigint {
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [majorStr, minorStr = ''] = abs.split('.')
  const major = BigInt(majorStr)
  const minorPadded = minorStr.padEnd(4, '0').slice(0, 4)
  const minor = BigInt(minorPadded)
  const total = major * MINOR_UNITS_PER_MAJOR + minor
  return negative ? -total : total
}

/** Parse whatever Postgres returned — string, bigint, or number — to a bigint in minor units. */
export function toBigintAmount(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return numericStringToBigint(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`non-finite numeric: ${value}`)
    return numericStringToBigint(value.toFixed(4))
  }
  if (value === null || value === undefined) return 0n
  throw new Error(`cannot coerce ${typeof value} to money bigint`)
}

/** Display helper: render a Money bigint as e.g. "1.5000" for logs. */
export const formatMoney = bigintToNumericString
