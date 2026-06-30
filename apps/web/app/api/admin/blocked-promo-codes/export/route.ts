import { desc } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = ['code', 'reason', 'added_at']

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const rows = await built.data.ctx.db
    .select({
      code: schema.blockedPromoCodes.code,
      reason: schema.blockedPromoCodes.reason,
      addedAt: schema.blockedPromoCodes.addedAt,
    })
    .from(schema.blockedPromoCodes)
    .orderBy(desc(schema.blockedPromoCodes.addedAt))

  return exportCsvResponse({
    reportKind: 'blocked_promo_codes',
    headers: HEADERS,
    rows: rows.map((r) => ({
      code: r.code,
      reason: r.reason,
      added_at: r.addedAt.toISOString(),
    })),
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
