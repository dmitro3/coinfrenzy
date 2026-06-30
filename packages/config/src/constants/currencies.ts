// Currency types used across the platform.
// GC = Gold Coins (play-only, no redemption)
// SC = Sweepstakes Coins (redeemable to USD subject to KYC + playthrough)
// USD = real currency (deposits, redemptions)

export const COIN_CURRENCIES = ['GC', 'SC'] as const
export type CoinCurrency = (typeof COIN_CURRENCIES)[number]

export const ALL_CURRENCIES = ['GC', 'SC', 'USD'] as const
export type Currency = (typeof ALL_CURRENCIES)[number]

export function isCoinCurrency(value: string): value is CoinCurrency {
  return (COIN_CURRENCIES as readonly string[]).includes(value)
}

export function isCurrency(value: string): value is Currency {
  return (ALL_CURRENCIES as readonly string[]).includes(value)
}
