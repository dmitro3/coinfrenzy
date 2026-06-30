import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  const { id } = await ctx2.params
  const db = getDb()

  const result = await db.delete(schema.authSession).where(eq(schema.authSession.userId, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.revoke_sessions',
    resourceKind: 'player',
    resourceId: id,
    after: { revoked_count: result.length ?? 0 },
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
