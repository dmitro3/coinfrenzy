import type { NextRequest } from 'next/server'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import { fetchPlayersList, type PlayersListFilters } from '@/app/(admin)/admin/players/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'id',
  'email',
  'username',
  'display_name',
  'state',
  'status',
  'kyc_level',
  'sc_balance',
  'gc_balance',
  'lifetime_spend_usd',
  'lifetime_redeemed_usd',
  'net_position_usd',
  'purchase_count',
  'redemption_count',
  'total_wagered_sc',
  'round_count',
  'session_count',
  'days_active',
  'last_seen_at',
  'last_purchase_at',
]

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const filters: PlayersListFilters = {
    search: url.searchParams.get('q') ?? undefined,
    status: (url.searchParams.get('status') as PlayersListFilters['status']) ?? 'all',
    kycLevel: (url.searchParams.get('kyc') as PlayersListFilters['kycLevel']) ?? 'all',
    state: url.searchParams.get('state') ?? 'all',
    quickFilter: (url.searchParams.get('quick') as PlayersListFilters['quickFilter']) ?? 'all',
  }

  const { rows } = await fetchPlayersList(filters)

  const exportRows = rows.map((r) => ({
    id: r.id,
    email: r.email,
    username: r.username ?? '',
    display_name: r.displayName ?? '',
    state: r.state ?? '',
    status: r.status,
    kyc_level: r.kycLevel,
    sc_balance: r.scBalance.toString(),
    gc_balance: r.gcBalance.toString(),
    lifetime_spend_usd: r.lifetimeSpendUsd.toString(),
    lifetime_redeemed_usd: r.lifetimeRedeemedUsd.toString(),
    net_position_usd: r.netPositionUsd.toString(),
    purchase_count: r.purchaseCount,
    redemption_count: r.redemptionCount,
    total_wagered_sc: r.totalWageredSc.toString(),
    round_count: r.roundCount,
    session_count: r.sessionCount,
    days_active: r.daysActive,
    last_seen_at: r.lastSeenAt ?? '',
    last_purchase_at: r.lastPurchaseAt ?? '',
  }))

  return exportCsvResponse({
    reportKind: 'players',
    headers: HEADERS,
    rows: exportRows,
    filter: filters as Record<string, unknown>,
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
