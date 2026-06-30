import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { canManageStaff, revokeAllSessionsForAdmin, revokeSession } from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.union([
  z.object({ kind: z.literal('one'), sessionId: z.string().uuid() }),
  z.object({ kind: z.literal('all_for_admin'), adminId: z.string().uuid() }),
])

/**
 * POST /api/admin/auth/revoke-session
 *
 * Revokes either a single session or all sessions for a given admin.
 *
 * Self-revoke any of own sessions: any admin.
 * Revoke another admin's session(s): master only.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const raw = (await req.json().catch(() => null)) as unknown
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const db = getDb()
  const { ip, userAgent } = await getRequestMeta()

  if (parsed.data.kind === 'one') {
    // Confirm ownership or master.
    const target = await db
      .select({ adminId: schema.adminSessions.adminId })
      .from(schema.adminSessions)
      .where(eq(schema.adminSessions.id, parsed.data.sessionId))
      .limit(1)
    const targetAdminId = target[0]?.adminId
    if (!targetAdminId) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const isSelf = targetAdminId === session.admin.id
    if (!isSelf && !canManageStaff(session.payload.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    await revokeSession({
      db,
      sessionId: parsed.data.sessionId,
      reason: isSelf ? 'self_revoke' : 'master_revoke',
      revokedBy: session.admin.id,
    })
    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.session.revoked',
      resourceKind: 'admin_session',
      resourceId: parsed.data.sessionId,
      ip,
      userAgent,
      metadata: { target_admin_id: targetAdminId },
    })
    return NextResponse.json({ ok: true, revoked: 1 })
  }

  // kind === 'all_for_admin'
  const isSelf = parsed.data.adminId === session.admin.id
  if (!isSelf && !canManageStaff(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const revoked = await revokeAllSessionsForAdmin({
    db,
    adminId: parsed.data.adminId,
    reason: isSelf ? 'self_revoke_all' : 'master_revoke_all',
    revokedBy: session.admin.id,
  })
  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.sessions.bulk_revoked',
    resourceKind: 'admin',
    resourceId: parsed.data.adminId,
    ip,
    userAgent,
    metadata: { revoked_count: revoked },
  })

  return NextResponse.json({ ok: true, revoked })
}
