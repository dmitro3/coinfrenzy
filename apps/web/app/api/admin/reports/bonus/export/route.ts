import { sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext, readRangeFromRequest } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'bonus_type',
  'awarded_count',
  'total_sc',
  'total_gc',
  'completed_count',
  'expired_count',
  'forfeited_count',
  'avg_playthrough_progress',
]

export async function GET(req: NextRequest) {
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const url = new URL(req.url)
  const range = readRangeFromRequest(url)

  const db = getDb()
  const rows = (await db.execute<{
    bonus_type: string
    awarded_count: string
    total_sc: string
    total_gc: string
    completed_count: string
    expired_count: string
    forfeited_count: string
    avg_playthrough_progress: string | null
  }>(sql`
    SELECT
      b.bonus_type::text AS bonus_type,
      COUNT(ba.id)::text AS awarded_count,
      COALESCE(SUM(ba.sc_amount), 0)::text AS total_sc,
      COALESCE(SUM(ba.gc_amount), 0)::text AS total_gc,
      COUNT(ba.id) FILTER (WHERE ba.status = 'completed')::text AS completed_count,
      COUNT(ba.id) FILTER (WHERE ba.status = 'expired')::text AS expired_count,
      COUNT(ba.id) FILTER (WHERE ba.status = 'forfeited')::text AS forfeited_count,
      AVG(
        CASE WHEN ba.playthrough_required > 0
          THEN ba.playthrough_progress::numeric / ba.playthrough_required::numeric
          ELSE NULL END
      )::text AS avg_playthrough_progress
    FROM bonuses b
    LEFT JOIN bonuses_awarded ba ON ba.bonus_id = b.id
      AND ba.created_at >= ${range.from}::date
      AND ba.created_at < (${range.to}::date + INTERVAL '1 day')
    GROUP BY b.bonus_type
    ORDER BY total_sc DESC NULLS LAST
  `)) as unknown as Array<{
    bonus_type: string
    awarded_count: string
    total_sc: string
    total_gc: string
    completed_count: string
    expired_count: string
    forfeited_count: string
    avg_playthrough_progress: string | null
  }>

  return exportCsvResponse({
    reportKind: 'bonus_report',
    headers: HEADERS,
    rows,
    filter: { from: range.from, to: range.to },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
