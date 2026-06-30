import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '@coinfrenzy/config'
import {
  ADMIN_SESSION_COOKIE,
  SESSION_DURATION_MS,
  issueSession,
  verifyForAdmin,
  verifyPending,
} from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  pending: z.string().min(1),
  code: z.string().min(6).max(12),
})

/**
 * POST /api/admin/auth/verify-2fa
 *
 * Step 2b of the login flow when `totp_enabled = true`. Verifies the
 * 6-digit TOTP code (or one-time backup code), issues an admin session,
 * sets the cookie, and stamps last_login.
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
  if (!payload || payload.purpose !== 'totp_verify') {
    return NextResponse.json({ error: 'invalid_pending' }, { status: 401 })
  }

  const db = getDb()
  const { ip, userAgent } = await getRequestMeta()

  if (e.NODE_ENV === 'production' && payload.ip !== ip) {
    return NextResponse.json({ error: 'ip_changed' }, { status: 401 })
  }

  // Temporary bypass — when ADMIN_2FA_OPTIONAL=true skip TOTP validation
  // and issue a session directly.
  // TODO: remove skip when going to production
  const secureCookie =
    req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'
  if (e.ADMIN_2FA_OPTIONAL) {
    const bypassSession = await issueSession(
      { secret: e.ADMIN_SESSION_SECRET, previousSecret: e.ADMIN_SESSION_SECRET_PREV ?? null },
      { db, adminId: payload.admin_id, role: payload.primary_role, ip, userAgent },
    )
    await db
      .update(schema.admins)
      .set({ lastLoginAt: new Date(), lastLoginIp: ip || null })
      .where(eq(schema.admins.id, payload.admin_id))
    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: payload.admin_id,
      actorRole: payload.primary_role,
      action: 'admin.login.success',
      resourceKind: 'admin_session',
      resourceId: bypassSession.sessionId,
      reason: 'ADMIN_2FA_OPTIONAL bypass — verify-2fa skipped (dev only)',
      ip,
      userAgent,
    })
    const bypassRes = NextResponse.json({ ok: true, redirect: '/admin' })
    bypassRes.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: bypassSession.token,
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      expires: bypassSession.expiresAt,
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    })
    return bypassRes
  }

  const ok = await verifyForAdmin({ db, adminId: payload.admin_id, code: parsed.data.code })
  if (!ok) {
    await writeAuditEntry(db, {
      actorKind: 'system',
      actorId: payload.admin_id,
      action: 'admin.2fa.verify.failed',
      ip,
      userAgent,
    })
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  const session = await issueSession(
    { secret: e.ADMIN_SESSION_SECRET, previousSecret: e.ADMIN_SESSION_SECRET_PREV ?? null },
    {
      db,
      adminId: payload.admin_id,
      role: payload.primary_role,
      ip,
      userAgent,
    },
  )

  await db
    .update(schema.admins)
    .set({ lastLoginAt: new Date(), lastLoginIp: ip || null })
    .where(eq(schema.admins.id, payload.admin_id))

  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: payload.admin_id,
    actorRole: payload.primary_role,
    action: 'admin.login.success',
    resourceKind: 'admin_session',
    resourceId: session.sessionId,
    ip,
    userAgent,
  })

  const res = NextResponse.json({ ok: true, redirect: '/admin' })
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  })
  return res
}
