import { desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb, schema } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'id',
  'username',
  'email',
  'display_name',
  'status',
  'revenue_share_pct',
  'total_signups_attributed',
  'total_active_attributed',
  'total_ngr_attributed_sc',
  'total_payouts_sc',
  'pending_payout_sc',
  'last_payout_at',
  'created_at',
]

export async function GET(req: NextRequest) {
  void req
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const db = getDb()
  const rows = await db
    .select({
      id: schema.affiliates.id,
      username: schema.affiliates.username,
      email: schema.affiliates.email,
      displayName: schema.affiliates.displayName,
      status: schema.affiliates.status,
      revenueSharePct: schema.affiliates.revenueSharePct,
      totalSignupsAttributed: schema.affiliates.totalSignupsAttributed,
      totalActiveAttributed: schema.affiliates.totalActiveAttributed,
      totalNgrAttributedSc: schema.affiliates.totalNgrAttributedSc,
      totalPayoutsSc: schema.affiliates.totalPayoutsSc,
      pendingPayoutSc: schema.affiliates.pendingPayoutSc,
      createdAt: schema.affiliates.createdAt,
      lastPayoutAt: schema.affiliatePayouts.paidAt,
    })
    .from(schema.affiliates)
    .leftJoin(
      schema.affiliatePayouts,
      eq(schema.affiliatePayouts.affiliateId, schema.affiliates.id),
    )
    .orderBy(desc(schema.affiliates.totalNgrAttributedSc))
    .limit(10_000)

  // Coalesce rows duplicated by the LEFT JOIN — keep the most-recent paid_at
  // per affiliate. This mirrors the page's coalescing logic so the CSV
  // matches what the user sees on screen.
  const map = new Map<string, Record<string, unknown>>()
  for (const r of rows) {
    const existing = map.get(r.id)
    const payoutAt = r.lastPayoutAt ? r.lastPayoutAt.toISOString() : null
    if (!existing) {
      map.set(r.id, {
        id: r.id,
        username: r.username,
        email: r.email,
        display_name: r.displayName,
        status: r.status,
        revenue_share_pct: r.revenueSharePct,
        total_signups_attributed: r.totalSignupsAttributed,
        total_active_attributed: r.totalActiveAttributed,
        total_ngr_attributed_sc: r.totalNgrAttributedSc,
        total_payouts_sc: r.totalPayoutsSc,
        pending_payout_sc: r.pendingPayoutSc,
        last_payout_at: payoutAt,
        created_at: r.createdAt,
      })
    } else if (
      payoutAt &&
      (!existing.last_payout_at || payoutAt > (existing.last_payout_at as string))
    ) {
      existing.last_payout_at = payoutAt
    }
  }

  return exportCsvResponse({
    reportKind: 'affiliate_report',
    headers: HEADERS,
    rows: Array.from(map.values()),
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
