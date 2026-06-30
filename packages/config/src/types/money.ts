// Money types per docs/02 §4 and .cursorrules.
// Money is bigint at the application layer; numeric(20,4) at the database
// layer. NEVER number or float. Currencies are explicit — no implicit currency.
//
// One minor unit = 1/10,000 of the major unit (matching numeric(20,4) DB scale).
// Example: 1 SC = 10_000n in minor units; $1.00 = 10_000n; 0.50 GC = 5_000n.

import type { CoinCurrency, Currency } from '../constants/currencies'

/**
 * Money expressed in minor units as a bigint, paired with its currency.
 * Always pass and store this struct together — never let the amount and
 * currency travel separately.
 */
export type Money = {
  amount: bigint
  currency: Currency
}

export type CoinMoney = {
  amount: bigint
  currency: CoinCurrency
}

export const MINOR_UNITS_PER_MAJOR = 10_000n

export function makeMoney(amount: bigint, currency: Currency): Money {
  return { amount, currency }
}

export function makeCoinMoney(amount: bigint, currency: CoinCurrency): CoinMoney {
  return { amount, currency }
}
