import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { hashPassword, verifyPassword } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5.2 — self-service password rotation for a logged-in admin.
// Requires the user's current password to authorize the change so a stolen
// session can't silently rotate the password without the human present.
// Audits success and failure separately.

const body = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { session, ip, userAgent } = built.data

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  if (parsed.newPassword !== parsed.confirmPassword) {
    return jsonError(400, 'password_mismatch')
  }
  if (parsed.newPassword === parsed.currentPassword) {
    return jsonError(400, 'password_unchanged')
  }

  const db = getDb()
  const [row] = await db
    .select({ passwordHash: schema.admins.passwordHash })
    .from(schema.admins)
    .where(eq(schema.admins.id, session.admin.id))
    .limit(1)
  if (!row) return jsonError(404, 'admin_not_found')

  const ok = await verifyPassword(parsed.currentPassword, row.passwordHash)
  if (!ok) {
    await audit.writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.password.change.failed',
      resourceKind: 'admin',
      resourceId: session.admin.id,
      reason: 'invalid_current_password',
      ip,
      userAgent,
    })
    return jsonError(401, 'invalid_current_password')
  }

  const newHash = await hashPassword(parsed.newPassword, 12)
  await db
    .update(schema.admins)
    .set({
      passwordHash: newHash,
      passwordSetAt: new Date(),
      // Whichever path got us here — invited admin's first reset or a
      // master-forced reset — clear the flag once the new password is
      // actually set.
      mustResetPassword: false,
    })
    .where(eq(schema.admins.id, session.admin.id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.password.changed',
    resourceKind: 'admin',
    resourceId: session.admin.id,
    ip,
    userAgent,
  })

  return NextResponse.json({ ok: true })
}
