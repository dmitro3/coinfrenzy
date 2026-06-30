import { cache } from 'react'

import { cookies } from 'next/headers'

import { isCoinCurrency, type CoinCurrency } from '@coinfrenzy/config'

// docs/10 §4.3 — the balance bar lets the player toggle between GC and
// SC; that choice persists across navigations via a non-HTTP-only cookie
// so server components (lobby, games, individual game pages) can render
// the right currency without a client roundtrip.
//
// Wrapped in `React.cache` so consumers in the layout + page + nested
// components share a single cookie read per request.
export const ACTIVE_CURRENCY_COOKIE = 'active_currency'

/** Read the active currency from cookies, defaulting to SC. */
export const getActiveCurrency = cache(async (): Promise<CoinCurrency> => {
  const store = await cookies()
  const raw = store.get(ACTIVE_CURRENCY_COOKIE)?.value
  if (raw && isCoinCurrency(raw)) return raw
  return 'SC'
})

/** Parse an optional currency value from a query string. */
export function parseCurrencyParam(value: string | string[] | undefined): CoinCurrency | null {
  const v = Array.isArray(value) ? value[0] : value
  if (v && isCoinCurrency(v)) return v
  return null
}
