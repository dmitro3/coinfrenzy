import { sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { ok, type Result } from '../errors/result'

import { TAX_REPORT_THRESHOLD_USD } from './constants'

// docs/07 §10 — annual 1099-MISC rollup. Inserts pending tax_reports rows
// for any player whose `paid` redemptions over the prior calendar year
// summed to ≥ $600 USD (numeric(20,4) ⇒ 6_000_000n minor units).
//
// We deliberately don't generate or deliver the forms here — the Master
// admin reviews the queue in `/admin/reports/tax` and triggers a tax-form
// service integration (Track1099 / TaxBandits) in v2.

export interface TaxRollupResult {
  taxYear: number
  inserted: number
  skipped: number
}

export async function generateAnnualTaxRollup(
  ctx: Context,
  options: { taxYear?: number } = {},
): Promise<Result<TaxRollupResult, never>> {
  const taxYear = options.taxYear ?? new Date().getUTCFullYear() - 1

  // Money in `redemptions.amount_usd` is numeric(20,4). $600 ⇒ 6_000_000n.
  // We sum at the DB layer — Drizzle returns the aggregate as a string.
  const rows = await ctx.db
    .select({
      playerId: schema.redemptions.playerId,
      total: sql<string>`coalesce(sum(${schema.redemptions.amountUsd}), 0)`.as('total'),
      cnt: sql<string>`count(*)`.as('cnt'),
    })
    .from(schema.redemptions)
    .where(
      sql`${schema.redemptions.status} = 'paid'
        AND ${schema.redemptions.paidAt} >= make_date(${taxYear}, 1, 1)
        AND ${schema.redemptions.paidAt} <  make_date(${taxYear + 1}, 1, 1)`,
    )
    .groupBy(schema.redemptions.playerId)

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const totalCents = parseNumeric(row.total)
    if (totalCents < TAX_REPORT_THRESHOLD_USD) continue

    const result = await ctx.db
      .insert(schema.taxReports)
      .values({
        playerId: row.playerId,
        taxYear,
        formType: '1099-MISC',
        totalAmountUsd: totalCents,
        redemptionCount: Number(row.cnt),
        status: 'pending_generation',
      })
      .onConflictDoNothing({
        target: [schema.taxReports.playerId, schema.taxReports.taxYear, schema.taxReports.formType],
      })
      .returning({ id: schema.taxReports.id })

    if (result.length > 0) inserted += 1
    else skipped += 1
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'tax_rollup.generated',
    metadata: { tax_year: taxYear, inserted, skipped },
  })

  return ok({ taxYear, inserted, skipped })
}

function parseNumeric(raw: string | number | bigint): bigint {
  if (typeof raw === 'bigint') return raw
  const str = typeof raw === 'number' ? raw.toString() : raw
  if (!str.includes('.')) return BigInt(str) * 10_000n
  const negative = str.startsWith('-')
  const abs = negative ? str.slice(1) : str
  const [whole = '0', frac = ''] = abs.split('.')
  const fracPadded = frac.padEnd(4, '0').slice(0, 4)
  const total = BigInt(whole) * 10_000n + BigInt(fracPadded || '0')
  return negative ? -total : total
}
