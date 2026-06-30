import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { confirmAndEnable } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Confirm TOTP self-enrollment for a logged-in admin. Verifies the 6-digit
// code against the candidate secret produced by /totp/begin, persists the
// secret, and returns one-time backup codes that the client must surface
// to the user immediately (we never return them again).

const body = z.object({
  secret: z.string().min(8).max(128),
  code: z.string().regex(/^[0-9]{6}$/),
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

  const db = getDb()
  const confirm = await confirmAndEnable({
    db,
    adminId: session.admin.id,
    secret: parsed.secret,
    code: parsed.code,
  })
  if (!confirm.ok) {
    await audit.writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.2fa.confirm.failed',
      resourceKind: 'admin',
      resourceId: session.admin.id,
      ip,
      userAgent,
    })
    return jsonError(401, 'invalid_code')
  }

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.2fa.enabled',
    resourceKind: 'admin',
    resourceId: session.admin.id,
    ip,
    userAgent,
    metadata: { flow: 'authenticated_self_enroll' },
  })

  return NextResponse.json({ ok: true, backupCodes: confirm.backupCodes })
}
