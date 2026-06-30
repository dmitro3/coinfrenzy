import { sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'cohort_week',
  'cohort_size',
  'week_active',
  'retained_pct',
  'cohort_paying',
  'paying_pct',
  'cohort_total_deposit_usd',
]

export async function GET(req: NextRequest) {
  void req
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const db = getDb()
  const rows = (await db.execute<{
    cohort_week: string
    cohort_size: string
    week_active: string
    cohort_paying: string
    cohort_total_deposit: string
  }>(sql`
    SELECT
      to_char(date_trunc('week', p.first_seen_at), 'YYYY-MM-DD') AS cohort_week,
      COUNT(DISTINCT p.id)::text AS cohort_size,
      COUNT(DISTINCT CASE WHEN p.last_seen_at > NOW() - INTERVAL '7 days' THEN p.id END)::text AS week_active,
      COUNT(DISTINCT CASE WHEN pls.total_deposited_usd > 0 THEN p.id END)::text AS cohort_paying,
      COALESCE(SUM(pls.total_deposited_usd), 0)::text AS cohort_total_deposit
    FROM players p
    LEFT JOIN player_lifetime_stats pls ON pls.player_id = p.id
    WHERE p.first_seen_at > NOW() - INTERVAL '6 months'
      AND p.is_internal_account = false
      AND p.deleted_at IS NULL
    GROUP BY date_trunc('week', p.first_seen_at)
    ORDER BY cohort_week DESC
  `)) as unknown as Array<{
    cohort_week: string
    cohort_size: string
    week_active: string
    cohort_paying: string
    cohort_total_deposit: string
  }>

  const exportRows = rows.map((r) => {
    const size = Number(r.cohort_size) || 0
    const active = Number(r.week_active) || 0
    const paying = Number(r.cohort_paying) || 0
    return {
      cohort_week: r.cohort_week,
      cohort_size: size,
      week_active: active,
      retained_pct: size > 0 ? ((active / size) * 100).toFixed(2) : '0.00',
      cohort_paying: paying,
      paying_pct: size > 0 ? ((paying / size) * 100).toFixed(2) : '0.00',
      cohort_total_deposit_usd: r.cohort_total_deposit,
    }
  })

  return exportCsvResponse({
    reportKind: 'users_daily_report',
    headers: HEADERS,
    rows: exportRows,
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
