import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { regenerateBackupCodes, verifyForAdmin } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5.2 — regenerate one-time backup codes. Requires a fresh TOTP
// code so that a hijacked session alone can't mint new rescue codes.
// Returns the new codes once; the client must surface them immediately
// and the old codes are invalidated atomically.

const body = z.object({
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
  const ok = await verifyForAdmin({ db, adminId: session.admin.id, code: parsed.code })
  if (!ok) {
    await audit.writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.2fa.backup_codes.regenerate.failed',
      resourceKind: 'admin',
      resourceId: session.admin.id,
      reason: 'invalid_code',
      ip,
      userAgent,
    })
    return jsonError(401, 'invalid_code')
  }

  const result = await regenerateBackupCodes({ db, adminId: session.admin.id })
  if (!result.ok) return jsonError(409, 'totp_not_enabled')

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.2fa.backup_codes.regenerated',
    resourceKind: 'admin',
    resourceId: session.admin.id,
    ip,
    userAgent,
  })

  return NextResponse.json({ ok: true, backupCodes: result.backupCodes })
}
