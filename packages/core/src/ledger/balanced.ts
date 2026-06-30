// docs/04 Law 1: every coin movement is a balanced double-entry transaction.
// Within a pair_id, debits and credits sum to zero PER CURRENCY.
// The `external` account is a synthetic kind for cash flowing in/out of the
// system, but per §3 the doc requires the per-currency balance to hold
// across every leg (external included). We enforce that here.

import type { Result } from '../errors/result'
import { err, ok } from '../errors/result'

import { bigintToNumericString } from './money'
import type { LedgerError } from './errors'
import type { EntrySpec, TransactionSpec } from './types'

/** Group entries by currency, then sum (credit - debit) per group. */
export function perCurrencyImbalance(entries: EntrySpec[]): Map<string, bigint> {
  const byCurrency = new Map<string, bigint>()
  for (const entry of entries) {
    const current = byCurrency.get(entry.currency) ?? 0n
    const delta = entry.leg === 'credit' ? entry.amount : -entry.amount
    byCurrency.set(entry.currency, current + delta)
  }
  return byCurrency
}

/**
 * Assert the spec balances per currency. Returns the offending currency on
 * failure so the caller can log it. No throws — failures are Result.
 */
export function assertBalanced(spec: TransactionSpec): Result<true, LedgerError> {
  if (spec.entries.length === 0) {
    return err({ code: 'empty_transaction' })
  }
  for (const entry of spec.entries) {
    if (entry.amount <= 0n) {
      return err({
        code: 'invalid_entry',
        reason: `amount must be > 0 (got ${entry.amount.toString()}); leg encodes direction`,
      })
    }
    if (entry.accountKind === 'player_wallet' && !entry.playerId && !entry.accountId) {
      return err({
        code: 'invalid_entry',
        reason: 'player_wallet entries require playerId (or pre-resolved accountId)',
      })
    }
  }
  const imbalance = perCurrencyImbalance(spec.entries)
  for (const [currency, delta] of imbalance) {
    if (delta !== 0n) {
      const totals = totalsFor(spec.entries, currency)
      return err({
        code: 'unbalanced_transaction',
        currency,
        debit: bigintToNumericString(totals.debit),
        credit: bigintToNumericString(totals.credit),
      })
    }
  }
  return ok(true)
}

function totalsFor(entries: EntrySpec[], currency: string): { debit: bigint; credit: bigint } {
  let debit = 0n
  let credit = 0n
  for (const e of entries) {
    if (e.currency !== currency) continue
    if (e.leg === 'debit') debit += e.amount
    else credit += e.amount
  }
  return { debit, credit }
}
