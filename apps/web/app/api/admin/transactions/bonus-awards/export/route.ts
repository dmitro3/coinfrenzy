import type { NextRequest } from 'next/server'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import { fetchBonusAwards } from '@/app/(admin)/admin/transactions/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'created_at',
  'id',
  'player_id',
  'player_email',
  'bonus_name',
  'bonus_type',
  'sc_amount',
  'gc_amount',
  'playthrough_required',
  'playthrough_progress',
  'status',
]

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'all'
  const bonusType = url.searchParams.get('type') ?? 'all'
  const quick = url.searchParams.get('quick') ?? 'all'
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const minSc = url.searchParams.get('min') ?? undefined
  const maxSc = url.searchParams.get('max') ?? undefined

  const rows = await fetchBonusAwards({
    status,
    bonusType,
    quick: quick as Parameters<typeof fetchBonusAwards>[0]['quick'],
    from,
    to,
    minSc,
    maxSc,
  })

  const exportRows = rows.map((r) => ({
    created_at: r.createdAt,
    id: r.id,
    player_id: r.playerId,
    player_email: r.playerEmail,
    bonus_name: r.bonusName,
    bonus_type: r.bonusType,
    sc_amount: r.scAmount,
    gc_amount: r.gcAmount,
    playthrough_required: r.playthroughRequired,
    playthrough_progress: r.playthroughProgress,
    status: r.status,
  }))

  return exportCsvResponse({
    reportKind: 'transactions_bonus_awards',
    headers: HEADERS,
    rows: exportRows,
    filter: { status, type: bonusType, quick, from, to, min: minSc, max: maxSc },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
