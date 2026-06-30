import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@coinfrenzy/config'
import { ADMIN_SESSION_COOKIE, revokeSession, verifySession } from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'

import { getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/auth/logout
 *
 * Revokes the current admin session row and clears the cookie. Always
 * succeeds idempotently — calling this without a valid cookie just
 * resets the (empty) cookie.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const e = env()
  const { ip, userAgent } = await getRequestMeta()

  if (token && e.ADMIN_SESSION_SECRET) {
    const db = getDb()
    const verified = await verifySession(
      { secret: e.ADMIN_SESSION_SECRET, previousSecret: e.ADMIN_SESSION_SECRET_PREV ?? null },
      { db, token, ip, userAgent, enforceBindings: false },
    )
    if (verified.ok) {
      await revokeSession({
        db,
        sessionId: verified.value.payload.session_id,
        reason: 'user_logout',
        revokedBy: verified.value.payload.admin_id,
      })
      await writeAuditEntry(db, {
        actorKind: 'admin',
        actorId: verified.value.payload.admin_id,
        actorRole: verified.value.payload.role,
        action: 'admin.logout',
        resourceKind: 'admin_session',
        resourceId: verified.value.payload.session_id,
        ip,
        userAgent,
      })
    }
  }

  const res = NextResponse.json({ ok: true, redirect: '/admin/login' })
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: e.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  })
  return res
}
