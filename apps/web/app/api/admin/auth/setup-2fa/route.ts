import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '@coinfrenzy/config'
import { beginSetup, verifyPending } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  pending: z.string().min(1),
})

/**
 * POST /api/admin/auth/setup-2fa
 *
 * Step 2a of the login flow when `totp_enabled = false`. Returns the QR
 * code + secret so the user can scan with their authenticator app. The
 * secret is NOT yet persisted — it's echoed back to the client and
 * persisted only after `confirm-2fa` verifies the first code.
 */
export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => null)) as unknown
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const e = env()
  if (!e.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  const payload = verifyPending(e.ADMIN_SESSION_SECRET, parsed.data.pending)
  if (!payload || payload.purpose !== 'totp_setup') {
    return NextResponse.json({ error: 'invalid_pending' }, { status: 401 })
  }

  const db = getDb()
  const rows = await db
    .select({ email: schema.admins.email, totpEnabled: schema.admins.totpEnabled })
    .from(schema.admins)
    .where(eq(schema.admins.id, payload.admin_id))
    .limit(1)
  const admin = rows[0]
  if (!admin) {
    return NextResponse.json({ error: 'admin_not_found' }, { status: 404 })
  }
  if (admin.totpEnabled) {
    return NextResponse.json({ error: 'totp_already_enabled' }, { status: 409 })
  }

  const setup = await beginSetup(admin.email)
  return NextResponse.json({
    ok: true,
    secret: setup.secret,
    otpauthUrl: setup.otpauthUrl,
    qrPngDataUrl: setup.qrPngDataUrl,
  })
}
