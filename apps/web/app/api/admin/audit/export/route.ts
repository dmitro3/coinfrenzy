import { and, desc, gte, lte, or, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { canReadAuditLog } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'
import { exportCsvResponse } from '@/lib/report-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'id',
  'occurred_at',
  'actor_kind',
  'actor_id',
  'actor_role',
  'action',
  'resource_kind',
  'resource_id',
  'ip',
  'reason',
]

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 50_000

const ACTOR_KINDS = ['admin', 'system', 'player', 'anonymous']

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  if (!canReadAuditLog(built.data.session.payload.role)) {
    redirect('/admin')
  }

  const url = new URL(req.url)
  const fromStr = url.searchParams.get('from')
  const toStr = url.searchParams.get('to')
  const q = url.searchParams.get('q')?.trim() ?? ''
  const kind = url.searchParams.get('kind')?.trim() ?? ''
  const limitRaw = Number(url.searchParams.get('limit') ?? '')
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT

  const conds = []
  if (fromStr) {
    const d = new Date(fromStr)
    if (!isNaN(d.getTime())) conds.push(gte(schema.auditLog.occurredAt, d))
    else return jsonError(400, 'invalid_from')
  }
  if (toStr) {
    const d = new Date(toStr)
    if (!isNaN(d.getTime())) conds.push(lte(schema.auditLog.occurredAt, d))
    else return jsonError(400, 'invalid_to')
  }
  if (q.length >= 2) {
    const pattern = `%${q}%`
    conds.push(
      or(
        sql`${schema.auditLog.action} ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.actorId}::text, '') ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.resourceId}, '') ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.resourceKind}, '') ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.reason}, '') ilike ${pattern}`,
      )!,
    )
  }
  if (kind && ACTOR_KINDS.includes(kind)) {
    conds.push(sql`${schema.auditLog.actorKind} = ${kind}`)
  }

  const rows = await built.data.ctx.db
    .select({
      id: schema.auditLog.id,
      actorKind: schema.auditLog.actorKind,
      actorId: schema.auditLog.actorId,
      actorRole: schema.auditLog.actorRole,
      action: schema.auditLog.action,
      resourceKind: schema.auditLog.resourceKind,
      resourceId: schema.auditLog.resourceId,
      ip: schema.auditLog.ip,
      occurredAt: schema.auditLog.occurredAt,
      reason: schema.auditLog.reason,
    })
    .from(schema.auditLog)
    .where(conds.length > 0 ? and(...conds) : sql`true`)
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(limit)

  return exportCsvResponse({
    reportKind: 'audit_log',
    headers: HEADERS,
    rows: rows.map((r) => ({
      id: r.id,
      occurred_at: r.occurredAt.toISOString(),
      actor_kind: r.actorKind,
      actor_id: r.actorId ?? '',
      actor_role: r.actorRole ?? '',
      action: r.action,
      resource_kind: r.resourceKind,
      resource_id: r.resourceId ?? '',
      ip: r.ip ?? '',
      reason: r.reason ?? '',
    })),
    filter: {
      from: fromStr ?? undefined,
      to: toStr ?? undefined,
      q: q || undefined,
      kind: kind || undefined,
      limit,
    },
    adminId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    requestId: built.data.ctx.reqId,
  })
}
