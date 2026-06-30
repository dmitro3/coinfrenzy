import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { beginSetup } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5.2 — TOTP self-enrollment for a logged-in admin who skipped it
// at first login (only possible in dev with ADMIN_2FA_OPTIONAL=true). Returns
// the QR + secret. The secret is NOT persisted yet — that happens on POST
// /api/admin/auth/totp/confirm after the user proves possession.

export async function POST(_req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { session } = built.data

  const db = getDb()
  const [admin] = await db
    .select({ email: schema.admins.email, totpEnabled: schema.admins.totpEnabled })
    .from(schema.admins)
    .where(eq(schema.admins.id, session.admin.id))
    .limit(1)
  if (!admin) return jsonError(404, 'admin_not_found')
  if (admin.totpEnabled) return jsonError(409, 'totp_already_enabled')

  const setup = await beginSetup(admin.email)
  return NextResponse.json({
    ok: true,
    secret: setup.secret,
    otpauthUrl: setup.otpauthUrl,
    qrPngDataUrl: setup.qrPngDataUrl,
  })
}
