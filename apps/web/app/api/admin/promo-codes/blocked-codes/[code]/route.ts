import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageBonuses(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { code: raw } = await ctx.params
  const code = decodeURIComponent(raw).toUpperCase()
  if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400 })

  const db = getDb()
  const deleted = await db
    .delete(schema.blockedPromoCodes)
    .where(eq(schema.blockedPromoCodes.code, code))
    .returning({ code: schema.blockedPromoCodes.code })

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const meta = await getRequestMeta()
  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.promo_code.unblocked',
    resourceKind: 'blocked_promo_code',
    resourceId: code,
    before: { code },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return NextResponse.json({ ok: true })
}
