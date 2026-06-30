import type { NextRequest } from 'next/server'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import { fetchPromoCodes } from '@/app/(admin)/admin/promo-codes/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'code',
  'status',
  'context',
  'description',
  'bonus_name',
  'bonus_sc',
  'bonus_gc',
  'bonus_multiplier',
  'uses_count',
  'max_total_uses',
  'max_per_player',
  'playthrough_multiplier',
  'playthrough_window_hours',
  'valid_from',
  'valid_until',
]

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'active'
  const context = url.searchParams.get('context') ?? 'all'
  const search = url.searchParams.get('search') ?? undefined

  const rows = await fetchPromoCodes({ status, context, search: search || undefined })

  return exportCsvResponse({
    reportKind: 'promo_codes',
    headers: HEADERS,
    rows: rows.map((r) => ({
      code: r.code,
      status: r.status,
      context: r.context,
      description: r.description ?? '',
      bonus_name: r.bonusName ?? '',
      bonus_sc: r.bonusSc.toString(),
      bonus_gc: r.bonusGc.toString(),
      bonus_multiplier: r.bonusMultiplier,
      uses_count: r.usesCount,
      max_total_uses: r.maxTotalUses ?? '',
      max_per_player: r.maxPerPlayer ?? '',
      playthrough_multiplier: r.playthroughMultiplier ?? '',
      playthrough_window_hours: r.playthroughWindowHours ?? '',
      valid_from: r.validFrom ? r.validFrom.toISOString() : '',
      valid_until: r.validUntil ? r.validUntil.toISOString() : '',
    })),
    filter: { status, context, search },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
