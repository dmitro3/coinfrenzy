import { sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext, readRangeFromRequest } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'bonus_type',
  'awarded',
  'completed',
  'expired',
  'forfeited',
  'completion_pct',
  'expiry_pct',
  'forfeit_pct',
  'avg_completion_hours',
  'avg_progress_pct',
]

export async function GET(req: NextRequest) {
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const url = new URL(req.url)
  const range = readRangeFromRequest(url)

  const db = getDb()
  const rows = (await db.execute<{
    bonus_type: string
    awarded: string
    completed: string
    expired: string
    forfeited: string
    avg_completion_hours: string | null
    avg_progress_pct: string | null
  }>(sql`
    SELECT
      b.bonus_type::text AS bonus_type,
      COUNT(ba.id)::text AS awarded,
      COUNT(ba.id) FILTER (WHERE ba.status = 'completed')::text AS completed,
      COUNT(ba.id) FILTER (WHERE ba.status = 'expired')::text AS expired,
      COUNT(ba.id) FILTER (WHERE ba.status = 'forfeited')::text AS forfeited,
      AVG(EXTRACT(EPOCH FROM (ba.completed_at - ba.created_at)) / 3600.0)
        FILTER (WHERE ba.status = 'completed')::text AS avg_completion_hours,
      AVG(
        CASE WHEN ba.playthrough_required > 0
          THEN ba.playthrough_progress::numeric / ba.playthrough_required::numeric
          ELSE NULL END
      )::text AS avg_progress_pct
    FROM bonuses b
    LEFT JOIN bonuses_awarded ba ON ba.bonus_id = b.id
      AND ba.created_at >= ${range.from}::date
      AND ba.created_at < (${range.to}::date + INTERVAL '1 day')
    GROUP BY b.bonus_type
    ORDER BY b.bonus_type
  `)) as unknown as Array<{
    bonus_type: string
    awarded: string
    completed: string
    expired: string
    forfeited: string
    avg_completion_hours: string | null
    avg_progress_pct: string | null
  }>

  const exportRows = rows.map((r) => {
    const awarded = Number(r.awarded) || 0
    const completed = Number(r.completed) || 0
    const expired = Number(r.expired) || 0
    const forfeited = Number(r.forfeited) || 0
    return {
      bonus_type: r.bonus_type,
      awarded,
      completed,
      expired,
      forfeited,
      completion_pct: awarded > 0 ? ((completed / awarded) * 100).toFixed(2) : '0.00',
      expiry_pct: awarded > 0 ? ((expired / awarded) * 100).toFixed(2) : '0.00',
      forfeit_pct: awarded > 0 ? ((forfeited / awarded) * 100).toFixed(2) : '0.00',
      avg_completion_hours: r.avg_completion_hours ? Number(r.avg_completion_hours).toFixed(2) : '',
      avg_progress_pct: r.avg_progress_pct ? (Number(r.avg_progress_pct) * 100).toFixed(2) : '',
    }
  })

  return exportCsvResponse({
    reportKind: 'playthrough_report',
    headers: HEADERS,
    rows: exportRows,
    filter: { from: range.from, to: range.to },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
