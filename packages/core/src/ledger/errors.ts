// Per docs/02 §4: every fallible function returns Result<T, E> with a
// discriminated error union. Adding a new error code is a typed change —
// callers will fail to compile until they handle it.

export type LedgerError =
  | {
      code: 'unbalanced_transaction'
      currency: string
      debit: string
      credit: string
    }
  | { code: 'empty_transaction' }
  | { code: 'invalid_entry'; reason: string }
  | { code: 'wallet_not_found'; playerId: string; currency: string }
  | {
      code: 'house_account_not_found'
      accountKind: string
      currency: string
    }
  | { code: 'serialization_failure' }
  | { code: 'serialization_failure_retries_exhausted' }
  | {
      code: 'insufficient_balance'
      playerId: string
      currency: string
      required: string
      available: string
    }
  | { code: 'pair_mismatch'; expectedPairId: string }
  | { code: 'database_error'; detail: string }
  | { code: 'invariant_violation'; reason: string }

export function isLedgerError(value: unknown): value is LedgerError {
  return typeof value === 'object' && value !== null && 'code' in (value as Record<string, unknown>)
}
