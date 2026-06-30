import { desc } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = ['domain', 'reason', 'added_at']

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const rows = await built.data.ctx.db
    .select({
      domain: schema.blockedDomains.domain,
      reason: schema.blockedDomains.reason,
      addedAt: schema.blockedDomains.addedAt,
    })
    .from(schema.blockedDomains)
    .orderBy(desc(schema.blockedDomains.addedAt))

  return exportCsvResponse({
    reportKind: 'blocked_domains',
    headers: HEADERS,
    rows: rows.map((r) => ({
      domain: r.domain,
      reason: r.reason,
      added_at: r.addedAt.toISOString(),
    })),
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
