import { eq, and } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import type { Currency } from '@coinfrenzy/config'

import type { Context } from '../context'
import type { Result } from '../errors/result'
import { err, ok } from '../errors/result'

import type { LedgerError } from './errors'
import type { LedgerAccountKind } from './types'

// docs/04 §2 + docs/03 §3.1: house_accounts seed maps the ledger
// `account_kind` enum onto rows by (kind, currency). The kind names in the
// seed sometimes embed the currency (e.g. `house_winnings_gc`,
// `affiliate_payable_sc`, `internal_account_sink_gc`) for historical reasons
// — this module hides that wart behind one lookup.

type HouseKindMap = Record<string, string>

// (ledger_kind:currency) -> house_accounts.kind. When unmapped, the ledger
// kind is used as-is (e.g. `house_bank` + USD -> kind=`house_bank`).
const LEDGER_KIND_TO_HOUSE_KIND: HouseKindMap = {
  'affiliate_payable:SC': 'affiliate_payable_sc',
  'internal_account_sink:GC': 'internal_account_sink_gc',
  'internal_account_sink:SC': 'internal_account_sink_sc',
}

const cache = new Map<string, string>()

function key(kind: LedgerAccountKind, currency: Currency): string {
  return `${kind}:${currency}`
}

function houseKindFor(kind: LedgerAccountKind, currency: Currency): string {
  return LEDGER_KIND_TO_HOUSE_KIND[key(kind, currency)] ?? kind
}

/**
 * Resolve `ledger_entries.account_id` for a non-player account kind.
 * Caches in-process — the seed never changes at runtime.
 */
export async function getHouseAccountId(
  ctx: Context,
  kind: LedgerAccountKind,
  currency: Currency,
): Promise<Result<string, LedgerError>> {
  const cacheKey = key(kind, currency)
  const cached = cache.get(cacheKey)
  if (cached) return ok(cached)

  const houseKind = houseKindFor(kind, currency)
  const rows = await ctx.db
    .select({ id: schema.houseAccounts.id })
    .from(schema.houseAccounts)
    .where(
      and(eq(schema.houseAccounts.kind, houseKind), eq(schema.houseAccounts.currency, currency)),
    )
    .limit(1)

  if (rows.length === 0) {
    return err({ code: 'house_account_not_found', accountKind: houseKind, currency })
  }
  cache.set(cacheKey, rows[0]!.id)
  return ok(rows[0]!.id)
}

/** Wipe the in-process cache. Used by tests that rebuild house_accounts. */
export function _clearHouseAccountCacheForTests(): void {
  cache.clear()
}

/** Returns true if this account kind lives on `players` (account_id = players.id). */
export function isPlayerScopedAccount(kind: LedgerAccountKind): boolean {
  return kind === 'player_wallet' || kind === 'pending_purchase' || kind === 'pending_redemption'
}

/** Returns true if this account kind lives in `house_accounts`. */
export function isHouseAccount(kind: LedgerAccountKind): boolean {
  return !isPlayerScopedAccount(kind)
}
