import { and, desc, gte, lte } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb, schema } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext, readRangeFromRequest } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'date',
  'revenue_usd',
  'redemptions_usd',
  'pending_usd',
  'cumulative_revenue_usd',
  'cumulative_redemptions_usd',
  'daily_redemption_rate',
  'lifetime_redemption_rate',
]

export async function GET(req: NextRequest) {
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const url = new URL(req.url)
  const range = readRangeFromRequest(url)

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.dailyRedemptionRateSnapshot)
    .where(
      and(
        gte(schema.dailyRedemptionRateSnapshot.date, range.from),
        lte(schema.dailyRedemptionRateSnapshot.date, range.to),
      ),
    )
    .orderBy(desc(schema.dailyRedemptionRateSnapshot.date))

  const exportRows = rows.map((r) => ({
    date: r.date,
    revenue_usd: r.revenueUsd,
    redemptions_usd: r.redemptionsUsd,
    pending_usd: r.pendingUsd,
    cumulative_revenue_usd: r.cumulativeRevenueUsd,
    cumulative_redemptions_usd: r.cumulativeRedemptionsUsd,
    daily_redemption_rate: r.dailyRedemptionRate,
    lifetime_redemption_rate: r.lifetimeRedemptionRate,
  }))

  return exportCsvResponse({
    reportKind: 'redeem_rate_report',
    headers: HEADERS,
    rows: exportRows,
    filter: { from: range.from, to: range.to },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
