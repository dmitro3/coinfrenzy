import { sql } from 'drizzle-orm'

import type { Context } from '../context'
import { ok, type Result } from '../errors/result'

import type { LedgerError } from './errors'
import { numericStringToBigint } from './money'

// docs/04 §7 — wallet reconciliation. We compute ledger sums per wallet
// (account_id, currency) over a sliding window and compare to the
// denormalized wallets.current_balance. A non-zero diff (> 0.0001) is SEV-1.
//
// We DON'T page from inside this module — alerting is the transport's job
// (apps/worker wires the result to PagerDuty per docs/04 §9.4). This keeps
// core pure-data and unit-testable.

export interface DriftRow {
  walletId: string
  playerId: string
  currency: 'GC' | 'SC'
  walletBalance: bigint
  ledgerBalance: bigint
  drift: bigint
}

export interface ReconcileResult {
  /** Status. `clean` -> no drift; `drift_detected` -> rows array is non-empty. */
  status: 'clean' | 'drift_detected'
  windowDays: number | null
  rows: DriftRow[]
  scannedAt: Date
}

const DRIFT_THRESHOLD_MINOR_UNITS = 1n // 0.0001 in 10_000-scaled minor units

interface RawDriftRow {
  wallet_id: string
  player_id: string
  currency: string
  wallet_total: string
  ledger_total: string | null
  drift: string
}

/**
 * docs/04 §7.1 — nightly reconciliation over a 30-day window. Partition
 * pruning makes this fast on the ledger_entries partitioned table.
 */
export async function reconcileWallets(
  ctx: Context,
  options: { windowDays?: number } = {},
): Promise<Result<ReconcileResult, LedgerError>> {
  const windowDays = options.windowDays ?? 30
  return runReconciliation(ctx, windowDays)
}

/**
 * docs/04 §7.1 — monthly full reconciliation over the entire ledger.
 * Takes 30+ minutes at scale; proves the whole system clean.
 */
export async function reconcileWalletsFull(
  ctx: Context,
): Promise<Result<ReconcileResult, LedgerError>> {
  return runReconciliation(ctx, null)
}

async function runReconciliation(
  ctx: Context,
  windowDays: number | null,
): Promise<Result<ReconcileResult, LedgerError>> {
  const windowClause =
    windowDays === null
      ? sql``
      : sql`and created_at >= now() - make_interval(days => ${windowDays})`

  const result = await ctx.db.execute(sql`
    with ledger_sums as (
      select
        account_id,
        currency,
        sum(case when leg = 'credit' then amount else -amount end) as sum
      from ledger_entries
      where account_kind = 'player_wallet'
        ${windowClause}
      group by account_id, currency
    )
    select
      w.id            as wallet_id,
      w.player_id     as player_id,
      w.currency      as currency,
      w.current_balance as wallet_total,
      coalesce(ls.sum, 0) as ledger_total,
      (w.current_balance - coalesce(ls.sum, 0)) as drift
    from wallets w
    left join ledger_sums ls on ls.account_id = w.id and ls.currency = w.currency
    where abs(w.current_balance - coalesce(ls.sum, 0)) > 0.0001
  `)

  const rawRows: RawDriftRow[] = (result as unknown as RawDriftRow[]) ?? []
  const rows: DriftRow[] = rawRows.map((row) => ({
    walletId: row.wallet_id,
    playerId: row.player_id,
    currency: row.currency as 'GC' | 'SC',
    walletBalance: numericStringToBigint(row.wallet_total),
    ledgerBalance: numericStringToBigint(row.ledger_total ?? '0'),
    drift: numericStringToBigint(row.drift),
  }))

  const hasDrift = rows.some((r) => abs(r.drift) >= DRIFT_THRESHOLD_MINOR_UNITS)

  return ok({
    status: hasDrift ? 'drift_detected' : 'clean',
    windowDays,
    rows,
    scannedAt: new Date(),
  })
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v
}
