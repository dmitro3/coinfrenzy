import { NextResponse, type NextRequest } from 'next/server'
import { sql, type SQL } from 'drizzle-orm'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §10.5 — message log search.

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  const url = new URL(req.url)
  const playerId = url.searchParams.get('playerId')
  const campaignId = url.searchParams.get('campaignId')
  const channel = url.searchParams.get('channel')
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const conds: SQL[] = []
  if (playerId) conds.push(sql`player_id = ${playerId}`)
  if (campaignId) conds.push(sql`campaign_id = ${campaignId}`)
  if (channel) conds.push(sql`channel = ${channel}`)
  if (status) conds.push(sql`status = ${status}`)

  const where =
    conds.length === 0
      ? sql`TRUE`
      : conds.reduce<SQL>((acc, c, i) => (i === 0 ? c : sql`${acc} AND ${c}`), sql`TRUE` as SQL)

  const rows = await ctx.db.execute(sql`
    SELECT
      id, player_id, campaign_id, flow_enrollment_id, template_id,
      channel, recipient, subject, status, ab_variant,
      created_at, sent_at, delivered_at, opened_at, clicked_at,
      error_code, error_message
    FROM crm_message_log
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `)
  return NextResponse.json({ rows })
}
