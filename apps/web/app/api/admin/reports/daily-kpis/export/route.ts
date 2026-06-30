import { and, desc, gte, lte } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb, schema } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext, readRangeFromRequest } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'date',
  'day_of_week',
  'dau',
  'unique_logins',
  'new_registered_players',
  'total_sc_staked',
  'total_sc_won',
  'total_ggr_sc',
  'total_ngr_sc',
  'total_deposits_usd',
  'depositors_count',
  'first_time_purchasers',
  'withdrawals_completed_usd',
  'bonus_total',
  'abp_per_dau',
  'aggr_per_dau',
  'angr_per_dau',
]

export async function GET(req: NextRequest) {
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const url = new URL(req.url)
  const range = readRangeFromRequest(url)

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.dailyOperationalSnapshots)
    .where(
      and(
        gte(schema.dailyOperationalSnapshots.date, range.from),
        lte(schema.dailyOperationalSnapshots.date, range.to),
      ),
    )
    .orderBy(desc(schema.dailyOperationalSnapshots.date))

  const exportRows = rows.map((r) => ({
    date: r.date,
    day_of_week: r.dayOfWeek,
    dau: r.dau,
    unique_logins: r.uniqueLogins,
    new_registered_players: r.newRegisteredPlayers,
    total_sc_staked: r.totalScStaked,
    total_sc_won: r.totalScWon,
    total_ggr_sc: r.totalGgrSc,
    total_ngr_sc: r.totalNgrSc,
    total_deposits_usd: r.totalDepositsUsd,
    depositors_count: r.depositorsCount,
    first_time_purchasers: r.firstTimePurchasers,
    withdrawals_completed_usd: r.withdrawalsCompletedUsd,
    bonus_total: r.bonusTotal,
    abp_per_dau: r.abpPerDau,
    aggr_per_dau: r.aggrPerDau,
    angr_per_dau: r.angrPerDau,
  }))

  return exportCsvResponse({
    reportKind: 'daily_kpis',
    headers: HEADERS,
    rows: exportRows,
    filter: { from: range.from, to: range.to },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
