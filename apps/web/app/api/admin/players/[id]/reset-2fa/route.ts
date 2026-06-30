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
  const [player] = await db.select().from(schema.players).where(eq(schema.players.id, id)).limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  // Players auth lives under Better Auth — players.id == auth_user.id.
  // Disable the TOTP flag and remove the rows; player will re-enroll on next login.
  await db.delete(schema.authTwoFactor).where(eq(schema.authTwoFactor.userId, id))
  await db
    .update(schema.authUser)
    .set({ twoFactorEnabled: false, updatedAt: new Date() })
    .where(eq(schema.authUser.id, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.reset_2fa',
    resourceKind: 'player',
    resourceId: id,
    before: { two_factor_enabled: true },
    after: { two_factor_enabled: false },
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
