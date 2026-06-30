import { desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { getDb, schema } from '@coinfrenzy/db'

import { exportCsvResponse } from '@/lib/report-csv'

import { buildReportsContext } from '../../_shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'player_id',
  'email',
  'username',
  'state',
  'kyc_level',
  'total_deposited_usd',
  'total_redeemed_usd',
  'net_position_usd',
  'total_wagered_sc',
  'total_won_sc',
  'ngr_sc',
  'purchase_count',
  'redemption_count',
  'session_count',
  'first_purchase_at',
  'last_purchase_at',
  'computed_at',
]

export async function GET(req: NextRequest) {
  void req
  const built = await buildReportsContext()
  if (built.kind === 'error') return built.response

  const db = getDb()
  const rows = await db
    .select({
      playerId: schema.playerLifetimeStats.playerId,
      email: schema.players.email,
      username: schema.players.username,
      state: schema.players.state,
      kycLevel: schema.players.kycLevel,
      totalDepositedUsd: schema.playerLifetimeStats.totalDepositedUsd,
      totalRedeemedUsd: schema.playerLifetimeStats.totalRedeemedUsd,
      netPositionUsd: schema.playerLifetimeStats.netPositionUsd,
      totalWageredSc: schema.playerLifetimeStats.totalWageredSc,
      totalWonSc: schema.playerLifetimeStats.totalWonSc,
      ngrSc: schema.playerLifetimeStats.ngrSc,
      purchaseCount: schema.playerLifetimeStats.purchaseCount,
      redemptionCount: schema.playerLifetimeStats.redemptionCount,
      sessionCount: schema.playerLifetimeStats.sessionCount,
      firstPurchaseAt: schema.playerLifetimeStats.firstPurchaseAt,
      lastPurchaseAt: schema.playerLifetimeStats.lastPurchaseAt,
      computedAt: schema.playerLifetimeStats.computedAt,
    })
    .from(schema.playerLifetimeStats)
    .innerJoin(schema.players, eq(schema.playerLifetimeStats.playerId, schema.players.id))
    .orderBy(desc(schema.playerLifetimeStats.totalDepositedUsd))
    .limit(50_000)

  const exportRows = rows.map((r) => ({
    player_id: r.playerId,
    email: r.email,
    username: r.username,
    state: r.state,
    kyc_level: r.kycLevel,
    total_deposited_usd: r.totalDepositedUsd,
    total_redeemed_usd: r.totalRedeemedUsd,
    net_position_usd: r.netPositionUsd,
    total_wagered_sc: r.totalWageredSc,
    total_won_sc: r.totalWonSc,
    ngr_sc: r.ngrSc,
    purchase_count: r.purchaseCount,
    redemption_count: r.redemptionCount,
    session_count: r.sessionCount,
    first_purchase_at: r.firstPurchaseAt,
    last_purchase_at: r.lastPurchaseAt,
    computed_at: r.computedAt,
  }))

  return exportCsvResponse({
    reportKind: 'purchase_report',
    headers: HEADERS,
    rows: exportRows,
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
