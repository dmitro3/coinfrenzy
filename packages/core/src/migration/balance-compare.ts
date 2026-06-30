// docs/13 §5.1 #2 — per-player balance comparison.
//
// Used both by the validation step (sampled) and by the admin
// "spot check 20 random players" UI on cutover night. For each Gamma
// player snapshot, returns:
//   - our current SC balance from wallets
//   - Gamma's exported SC balance
//   - the absolute drift
//
// The Gamma side comes from the snapshot CSV — we do NOT call Gamma at
// query time. The snapshot IS authoritative.

import { and, eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { numericStringToBigint, formatMoney } from '../ledger/money'

import { parseCsv } from './csv'
import { getSnapshotStore } from './snapshot-store'
import { parseMoney } from './transforms'
import { SNAPSHOT_FILE_NAMES } from './types'

export interface BalanceCompareRow {
  gammaUserId: string
  email: string | null
  ourScBalance: string
  gammaScBalance: string
  driftMinor: string
  status: 'match' | 'drift' | 'missing_on_our_side'
}

export interface BalanceCompareResult {
  snapshotDate: string
  totalChecked: number
  totalDrift: number
  totalMissing: number
  rows: BalanceCompareRow[]
}

export interface BalanceCompareInput {
  ctx: Context
  snapshotDate: string
  /** Optional cap on how many rows to return. Defaults to all. */
  limit?: number
  /** Only return rows that don't match (drift or missing). */
  driftOnly?: boolean
}

export async function compareBalances(input: BalanceCompareInput): Promise<BalanceCompareResult> {
  const store = getSnapshotStore()
  // Gamma's per-player SC balance is in purchase_report.csv (not
  // players_data.csv — that one has profile fields only).
  const purchaseCsv = await store.readFile(input.snapshotDate, SNAPSHOT_FILE_NAMES.purchases)
  if (!purchaseCsv) {
    return {
      snapshotDate: input.snapshotDate,
      totalChecked: 0,
      totalDrift: 0,
      totalMissing: 0,
      rows: [],
    }
  }
  const parsed = parseCsv(SNAPSHOT_FILE_NAMES.purchases, purchaseCsv)

  const rows: BalanceCompareRow[] = []
  let drift = 0
  let missing = 0
  const cap = input.limit ?? Number.MAX_SAFE_INTEGER

  for (const row of parsed.rows) {
    const gammaUserId = (row['User Id'] ?? '').trim()
    if (!gammaUserId) continue
    if (rows.length >= cap) break

    const gammaBalanceStr = parseMoney(
      row['SC Balance'] ?? row['Current SC Balance'] ?? row['Balance SC'] ?? '0',
    )
    const gammaBalanceMinor = numericStringToBigint(gammaBalanceStr)

    const matched = await input.ctx.db
      .select({
        id: schema.players.id,
        email: schema.players.email,
      })
      .from(schema.players)
      .where(eq(schema.players.gammaUserId, gammaUserId))
      .limit(1)

    if (!matched[0]) {
      missing++
      rows.push({
        gammaUserId,
        email: null,
        ourScBalance: '0.0000',
        gammaScBalance: gammaBalanceStr,
        driftMinor: gammaBalanceMinor.toString(),
        status: 'missing_on_our_side',
      })
      continue
    }

    const walletRows = await input.ctx.db
      .select({ currentBalance: schema.wallets.currentBalance })
      .from(schema.wallets)
      .where(and(eq(schema.wallets.playerId, matched[0].id), eq(schema.wallets.currency, 'SC')))
      .limit(1)

    const ourScMinor = walletRows[0]?.currentBalance ?? 0n
    const driftMinor =
      gammaBalanceMinor > ourScMinor
        ? gammaBalanceMinor - ourScMinor
        : ourScMinor - gammaBalanceMinor

    const status: BalanceCompareRow['status'] = driftMinor === 0n ? 'match' : 'drift'
    if (status === 'drift') drift++
    if (input.driftOnly && status === 'match') continue

    rows.push({
      gammaUserId,
      email: matched[0].email,
      ourScBalance: formatMoney(ourScMinor),
      gammaScBalance: gammaBalanceStr,
      driftMinor: driftMinor.toString(),
      status,
    })
  }

  return {
    snapshotDate: input.snapshotDate,
    totalChecked: rows.length,
    totalDrift: drift,
    totalMissing: missing,
    rows,
  }
}
