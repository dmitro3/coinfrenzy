import type { NextRequest } from 'next/server'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import {
  fetchCasinoActivity,
  type CasinoActivityFilters,
} from '@/app/(admin)/admin/transactions/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'created_at',
  'type',
  'currency',
  'amount',
  'player_id',
  'player_email',
  'game_id',
  'game_name',
  'provider_slug',
  'provider_name',
  'round_id',
  'pair_id',
  'ledger_id',
]

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const filters: CasinoActivityFilters = {
    type: (url.searchParams.get('type') as CasinoActivityFilters['type']) ?? 'all',
    currency: (url.searchParams.get('currency') as CasinoActivityFilters['currency']) ?? 'all',
    quick: (url.searchParams.get('quick') as CasinoActivityFilters['quick']) ?? 'all',
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    providerSlug: url.searchParams.get('provider') ?? 'all',
    minAmount: url.searchParams.get('min') ?? undefined,
    maxAmount: url.searchParams.get('max') ?? undefined,
    // For exports we bump to 50k. The hard cap protects against accidental
    // gigabyte-scale CSVs for unfiltered "all time" requests.
    limit: 50_000,
  }

  const rows = await fetchCasinoActivity(filters)

  const exportRows = rows.map((r) => ({
    created_at: r.createdAt,
    type: r.source,
    currency: r.currency,
    amount: r.amount,
    player_id: r.playerId,
    player_email: r.playerEmail,
    game_id: r.gameId,
    game_name: r.gameName,
    provider_slug: r.providerSlug,
    provider_name: r.providerName,
    round_id: r.roundId,
    pair_id: r.pairId,
    ledger_id: r.id,
  }))

  return exportCsvResponse({
    reportKind: 'transactions_casino',
    headers: HEADERS,
    rows: exportRows,
    filter: {
      type: filters.type,
      currency: filters.currency,
      quick: filters.quick,
      from: filters.from,
      to: filters.to,
      provider: filters.providerSlug,
      min: filters.minAmount,
      max: filters.maxAmount,
    },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
