import type { NextRequest } from 'next/server'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import { fetchPurchases } from '@/app/(admin)/admin/transactions/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'created_at',
  'id',
  'player_id',
  'player_email',
  'package_name',
  'amount_usd',
  'base_gc',
  'base_sc',
  'bonus_gc',
  'bonus_sc',
  'card_brand',
  'card_last4',
  'status',
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

  const rows = await fetchPurchases({
    status,
    quick: quick as Parameters<typeof fetchPurchases>[0]['quick'],
    from,
    to,
    minUsd,
    maxUsd,
  })

  const exportRows = rows.map((r) => ({
    created_at: r.createdAt,
    id: r.id,
    player_id: r.playerId,
    player_email: r.playerEmail,
    package_name: r.packageName,
    amount_usd: r.amountUsd,
    base_gc: r.baseGc,
    base_sc: r.baseSc,
    bonus_gc: r.bonusGc,
    bonus_sc: r.bonusSc,
    card_brand: r.cardBrand,
    card_last4: r.cardLast4,
    status: r.status,
  }))

  return exportCsvResponse({
    reportKind: 'transactions_purchases',
    headers: HEADERS,
    rows: exportRows,
    filter: { status, quick, from, to, min: minUsd, max: maxUsd },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
