import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { audit } from '@coinfrenzy/core'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  let body: { enabled?: boolean }
  try {
    body = (await req.json()) as { enabled?: boolean }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  await built.data.ctx.db
    .update(schema.reportSubscriptions)
    .set({ enabled: body.enabled })
    .where(
      and(
        eq(schema.reportSubscriptions.id, id),
        eq(schema.reportSubscriptions.adminId, built.data.session.admin.id),
      ),
    )

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: body.enabled ? 'reports.subscription.enable' : 'reports.subscription.disable',
    resourceKind: 'report_subscription',
    resourceId: id,
    requestId: built.data.ctx.reqId,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  await built.data.ctx.db
    .delete(schema.reportSubscriptions)
    .where(
      and(
        eq(schema.reportSubscriptions.id, id),
        eq(schema.reportSubscriptions.adminId, built.data.session.admin.id),
      ),
    )

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: 'reports.subscription.delete',
    resourceKind: 'report_subscription',
    resourceId: id,
    requestId: built.data.ctx.reqId,
  })

  return NextResponse.json({ ok: true })
}
