import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { canViewAllVips } from '@coinfrenzy/core/auth'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'
import { fetchAllVips, type AdminVipListFilters } from '@/app/(admin)/admin/vip/_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'id',
  'email',
  'display_name',
  'vip_status',
  'lifetime_spend_usd',
  'assigned_host_id',
  'assigned_host_name',
  'kyc_level',
  'last_seen_at',
  'last_interaction_at',
]

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canViewAllVips(built.data.session.payload.role)) redirect('/admin')

  const url = new URL(req.url)
  const filters: AdminVipListFilters = {
    search: url.searchParams.get('q') ?? undefined,
    status: (url.searchParams.get('status') as AdminVipListFilters['status']) ?? 'all',
    hostId: (url.searchParams.get('host') as AdminVipListFilters['hostId']) ?? 'all',
    activity: (url.searchParams.get('activity') as AdminVipListFilters['activity']) ?? 'all',
    kycLevel: (url.searchParams.get('kyc') as AdminVipListFilters['kycLevel']) ?? 'all',
  }

  const { rows } = await fetchAllVips(filters)

  return exportCsvResponse({
    reportKind: 'vips',
    headers: HEADERS,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      display_name: r.displayName ?? '',
      vip_status: r.vipStatus,
      lifetime_spend_usd: r.lifetimeSpendUsdMinor.toString(),
      assigned_host_id: r.assignedHostId ?? '',
      assigned_host_name: r.assignedHostName ?? '',
      kyc_level: r.kycLevel,
      last_seen_at: r.lastSeenAt ? r.lastSeenAt.toISOString() : '',
      last_interaction_at: r.lastInteractionAt ? r.lastInteractionAt.toISOString() : '',
    })),
    filter: filters as Record<string, unknown>,
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
