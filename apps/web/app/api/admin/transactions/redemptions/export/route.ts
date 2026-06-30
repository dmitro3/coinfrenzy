import type { NextRequest } from 'next/server'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import { fetchRedemptionsBroad } from '@/app/(admin)/admin/transactions/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'created_at',
  'id',
  'player_id',
  'player_email',
  'amount_usd',
  'amount_sc',
  'method',
  'status',
  'kyc_level',
  'approved_at',
  'paid_at',
  'reviewer_id',
]

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'all'
  const quick = url.searchParams.get('quick') ?? 'all'
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const minUsd = url.searchParams.get('min') ?? undefined
  const maxUsd = url.searchParams.get('max') ?? undefined
  const kycLevel = url.searchParams.get('kyc') ?? 'all'

  const rows = await fetchRedemptionsBroad({
    status,
    quick: quick as Parameters<typeof fetchRedemptionsBroad>[0]['quick'],
    from,
    to,
    minUsd,
    maxUsd,
    kycLevel,
  })

  const exportRows = rows.map((r) => ({
    created_at: r.createdAt,
    id: r.id,
    player_id: r.playerId,
    player_email: r.playerEmail,
    amount_usd: r.amountUsd,
    amount_sc: r.amountSc,
    method: r.method,
    status: r.status,
    kyc_level: r.kycLevel,
    approved_at: r.approvedAt,
    paid_at: r.paidAt,
    reviewer_id: r.reviewerId,
  }))

  return exportCsvResponse({
    reportKind: 'transactions_redemptions',
    headers: HEADERS,
    rows: exportRows,
    filter: { status, quick, from, to, min: minUsd, max: maxUsd, kyc: kycLevel },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
