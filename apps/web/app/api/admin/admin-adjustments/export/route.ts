import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { schema } from '@coinfrenzy/db'

import { buildAdminContext } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirror the on-screen columns so the CSV reads the same as the table.
const HEADERS = [
  'created_at',
  'admin_id',
  'admin_name',
  'player_id',
  'player_display_name',
  'player_username',
  'player_email',
  'currency',
  'sub_bucket',
  'amount',
  'direction',
  'signed_amount',
  'reason_category',
  'reason',
  'adjustment_id',
]

const MAX_LIMIT = 10_000

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const currency = url.searchParams.get('currency') ?? 'all'
  const direction = url.searchParams.get('direction') ?? 'all'
  const search = url.searchParams.get('q')?.trim() ?? ''
  const limitRaw = Number(url.searchParams.get('limit') ?? '')
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : MAX_LIMIT

  const conds = []
  if (currency !== 'all') conds.push(eq(schema.adminAdjustments.currency, currency))
  if (direction !== 'all') conds.push(eq(schema.adminAdjustments.direction, direction))
  if (search.length >= 2) {
    const q = `%${search}%`
    conds.push(
      or(
        ilike(schema.players.email, q),
        ilike(schema.players.username, q),
        ilike(schema.players.displayName, q),
      )!,
    )
  }

  const rows = await built.data.ctx.db
    .select({
      id: schema.adminAdjustments.id,
      playerId: schema.adminAdjustments.playerId,
      adminId: schema.adminAdjustments.adminId,
      amount: schema.adminAdjustments.amount,
      currency: schema.adminAdjustments.currency,
      subBucket: schema.adminAdjustments.subBucket,
      direction: schema.adminAdjustments.direction,
      reason: schema.adminAdjustments.reason,
      reasonCategory: schema.adminAdjustments.reasonCategory,
      createdAt: schema.adminAdjustments.createdAt,
      playerEmail: schema.players.email,
      playerDisplayName: schema.players.displayName,
      playerUsername: schema.players.username,
      adminName: schema.admins.displayName,
      adminEmail: schema.admins.email,
    })
    .from(schema.adminAdjustments)
    .leftJoin(schema.players, sql`${schema.players.id} = ${schema.adminAdjustments.playerId}`)
    .leftJoin(schema.admins, sql`${schema.admins.id} = ${schema.adminAdjustments.adminId}`)
    .where(conds.length > 0 ? and(...conds) : sql`true`)
    .orderBy(desc(schema.adminAdjustments.createdAt))
    .limit(limit)

  return exportCsvResponse({
    reportKind: 'admin_adjustments',
    headers: HEADERS,
    rows: rows.map((r) => {
      const sign = r.direction === 'credit' ? '+' : '-'
      return {
        created_at: r.createdAt.toISOString(),
        admin_id: r.adminId,
        admin_name: r.adminName ?? r.adminEmail ?? '',
        player_id: r.playerId,
        player_display_name: r.playerDisplayName ?? '',
        player_username: r.playerUsername ?? '',
        player_email: r.playerEmail ?? '',
        currency: r.currency,
        sub_bucket: r.subBucket ?? '',
        amount: r.amount.toString(),
        direction: r.direction,
        signed_amount: `${sign}${r.amount.toString()}`,
        reason_category: r.reasonCategory,
        reason: r.reason,
        adjustment_id: r.id,
      }
    }),
    filter: { currency, direction, q: search || undefined, limit },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
