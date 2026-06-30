import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '@coinfrenzy/config'
import {
  ADMIN_SESSION_COOKIE,
  SESSION_DURATION_MS,
  confirmAndEnable,
  issueSession,
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
  secret: z.string().min(8).max(128),
  code: z.string().regex(/^[0-9]{6}$/),
})

/**
 * POST /api/admin/auth/confirm-2fa
 *
 * Step 3 (first-time path): verifies the code against the secret produced
 * by /setup-2fa, persists the secret, and ALSO immediately issues an
 * admin session so the user lands on the dashboard. Returns the rescue
 * codes once — caller must surface them to the user immediately.
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
  const { ip, userAgent } = await getRequestMeta()

  // Bindings must match the pending token's IP/UA from the password step.
  if (e.NODE_ENV === 'production' && payload.ip !== ip) {
    return NextResponse.json({ error: 'ip_changed' }, { status: 401 })
  }

  const secureCookie =
    req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'

  // Temporary bypass — when ADMIN_2FA_OPTIONAL=true skip TOTP validation
  // and issue a session without persisting the secret.
  // TODO: remove skip when going to production
  if (e.ADMIN_2FA_OPTIONAL) {
    const session = await issueSession(
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
      resourceId: session.sessionId,
      reason: 'ADMIN_2FA_OPTIONAL bypass — confirm-2fa skipped (dev only)',
      ip,
      userAgent,
    })
    const bypassRes = NextResponse.json({ ok: true, redirect: '/admin', backupCodes: [] })
    setSessionCookie(bypassRes, session.token, session.expiresAt, secureCookie)
    return bypassRes
  }

  const confirm = await confirmAndEnable({
    db,
    adminId: payload.admin_id,
    secret: parsed.data.secret,
    code: parsed.data.code,
  })
  if (!confirm.ok) {
    await writeAuditEntry(db, {
      actorKind: 'system',
      actorId: payload.admin_id,
      action: 'admin.2fa.confirm.failed',
      ip,
      userAgent,
    })
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  // Issue a fresh admin session.
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

  // Stamp last_login.
  await db
    .update(schema.admins)
    .set({ lastLoginAt: new Date(), lastLoginIp: ip || null })
    .where(eq(schema.admins.id, payload.admin_id))

  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: payload.admin_id,
    actorRole: payload.primary_role,
    action: 'admin.2fa.enabled',
    resourceKind: 'admin',
    resourceId: payload.admin_id,
    ip,
    userAgent,
  })
  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: payload.admin_id,
    actorRole: payload.primary_role,
    action: 'admin.login.success',
    resourceKind: 'admin_session',
    resourceId: session.sessionId,
    ip,
    userAgent,
    metadata: { fresh_2fa_setup: true },
  })

  const res = NextResponse.json({
    ok: true,
    redirect: '/admin',
    backupCodes: confirm.backupCodes,
  })
  setSessionCookie(res, session.token, session.expiresAt, secureCookie)
  return res
}

function setSessionCookie(res: NextResponse, token: string, expiresAt: Date, secure: boolean) {
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  })
}
