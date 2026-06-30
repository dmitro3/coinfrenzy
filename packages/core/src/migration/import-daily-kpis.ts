// docs/13 §2.3 — daily KPI importer.
//
// Gamma's merv_report.csv is 57 columns of per-day platform aggregates.
// We map a subset into `daily_operational_snapshots` so the dashboard
// can show year-over-year history from day one of cutover. This is pure
// reporting data; no ledger entries.

import { schema } from '@coinfrenzy/db'

import { numericStringToBigint } from '../ledger/money'

import { parseDatetime, parseMoney } from './transforms'
import type { ParsedCsv, RunContext } from './types'

const COLUMN_FALLBACKS: Record<string, string[]> = {
  date: ['Date', 'Day', 'Report Date'],
  dau: ['DAU', 'Daily Active Users', 'Active Users'],
  newSignups: ['New Signups', 'New Registered Players', 'New Players'],
  deposits: ['Deposits USD', 'Total Deposits', 'Deposit Amount'],
  ggrSc: ['GGR SC', 'GGR'],
  ngrSc: ['NGR SC', 'NGR'],
  stakedSc: ['Total Staked SC', 'Total Wagered SC'],
  withdrawalsSc: ['Total Withdrawn SC', 'Withdrawals SC'],
  withdrawalsUsd: ['Total Withdrawn USD', 'Withdrawals USD'],
}

function pick(raw: Record<string, string>, candidates: string[]): string | null {
  for (const k of candidates) {
    const v = raw[k]
    if (v != null && v !== '') return v
  }
  return null
}

export async function importDailyKpis(rc: RunContext, file: ParsedCsv): Promise<void> {
  const { ctx } = rc
  let rowsImported = 0
  let rowsFailed = 0
  let rowsSkipped = 0

  for (let i = 0; i < file.rows.length; i++) {
    const raw = file.rows[i]
    const rowNumber = i + 2
    try {
      const dateStr = pick(raw, COLUMN_FALLBACKS.date)
      if (!dateStr) {
        rowsSkipped++
        continue
      }
      const parsedIso = parseDatetime(dateStr)
      if (!parsedIso) {
        rc.errors.push({
          sourceFile: file.filename,
          sourceRowNumber: rowNumber,
          sourceRowSnapshot: raw,
          errorCode: 'unparseable_date',
          errorMessage: `Could not parse "${dateStr}"`,
          errorField: 'date',
        })
        rowsFailed++
        continue
      }
      const date = parsedIso.slice(0, 10)
      const day = new Date(parsedIso).toLocaleDateString('en-US', { weekday: 'long' })

      const dau = parseIntSafe(pick(raw, COLUMN_FALLBACKS.dau))
      const newSignups = parseIntSafe(pick(raw, COLUMN_FALLBACKS.newSignups))
      const depositsUsd = numericStringToBigint(
        parseMoney(pick(raw, COLUMN_FALLBACKS.deposits) ?? '0'),
      )
      const ggrSc = numericStringToBigint(parseMoney(pick(raw, COLUMN_FALLBACKS.ggrSc) ?? '0'))
      const ngrSc = numericStringToBigint(parseMoney(pick(raw, COLUMN_FALLBACKS.ngrSc) ?? '0'))
      const stakedSc = numericStringToBigint(
        parseMoney(pick(raw, COLUMN_FALLBACKS.stakedSc) ?? '0'),
      )
      const withdrawalsSc = numericStringToBigint(
        parseMoney(pick(raw, COLUMN_FALLBACKS.withdrawalsSc) ?? '0'),
      )
      const withdrawalsUsd = numericStringToBigint(
        parseMoney(pick(raw, COLUMN_FALLBACKS.withdrawalsUsd) ?? '0'),
      )

      await ctx.db
        .insert(schema.dailyOperationalSnapshots)
        .values({
          date,
          dayOfWeek: day,
          dau,
          newRegisteredPlayers: newSignups,
          totalScStaked: stakedSc,
          totalGgrSc: ggrSc,
          totalNgrSc: ngrSc,
          totalDepositsUsd: depositsUsd,
          withdrawalsRequestedSc: withdrawalsSc,
          withdrawalsCompletedSc: withdrawalsSc,
          withdrawalsCompletedUsd: withdrawalsUsd,
        })
        .onConflictDoUpdate({
          target: schema.dailyOperationalSnapshots.date,
          set: {
            dau,
            newRegisteredPlayers: newSignups,
            totalScStaked: stakedSc,
            totalGgrSc: ggrSc,
            totalNgrSc: ngrSc,
            totalDepositsUsd: depositsUsd,
            withdrawalsRequestedSc: withdrawalsSc,
            withdrawalsCompletedSc: withdrawalsSc,
            withdrawalsCompletedUsd: withdrawalsUsd,
            generatedAt: new Date(),
          },
        })

      rowsImported++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      rc.errors.push({
        sourceFile: file.filename,
        sourceRowNumber: rowNumber,
        sourceRowSnapshot: raw,
        errorCode: 'daily_kpi_import_failed',
        errorMessage: message,
      })
      rowsFailed++
    }
  }

  rc.summaries.push({
    sourceFile: file.filename,
    tableName: 'daily_operational_snapshots',
    rowsInSource: file.rows.length,
    rowsImported,
    rowsSkipped,
    rowsFailed,
    status:
      rowsFailed > 0 && rowsImported === 0 ? 'failed' : rowsFailed > 0 ? 'partial' : 'success',
  })
}

function parseIntSafe(v: string | null): number {
  if (!v) return 0
  const n = parseInt(v.replace(/[,$]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
