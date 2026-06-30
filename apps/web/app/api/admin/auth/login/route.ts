import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '@coinfrenzy/config'
import {
  ADMIN_SESSION_COOKIE,
  SESSION_DURATION_MS,
  authenticateAdmin,
  issuePending,
  issueSession,
} from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  // turnstileToken: z.string().optional(),
})

// async function verifyTurnstileToken(
//   secretKey: string,
//   token: string,
//   ip: string,
// ): Promise<boolean> {
//   const body = new URLSearchParams({
//     secret: secretKey,
//     response: token,
//     ...(ip ? { remoteip: ip } : {}),
//   })
//   const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
//     method: 'POST',
//     headers: { 'content-type': 'application/x-www-form-urlencoded' },
//     body: body.toString(),
//   })
//   if (!res.ok) return false
//   const json = (await res.json().catch(() => ({}))) as { success?: boolean }
//   return json.success === true
// }

/**
 * POST /api/admin/auth/login
 *
 * Step 1 of the admin login flow. Verifies (email, password) and returns a
 * short-lived pending-2FA token. The client then proceeds to either
 *   - /api/admin/auth/setup-2fa  (when totpEnabled = false; first session)
 *   - /api/admin/auth/verify-2fa (otherwise)
 */
export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => null)) as unknown
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const {
    email,
    password,
    // turnstileToken
  } = parsed.data
  const db = getDb()
  const { ip, userAgent } = await getRequestMeta()
  const e = env()

  if (e?.CF_TURNSTILE_SECRET_KEY) {
    // if (!turnstileToken) {
    //   return NextResponse.json({ error: 'turnstile_required' }, { status: 400 })
    // }
    // const passed = await verifyTurnstileToken(e.CF_TURNSTILE_SECRET_KEY, turnstileToken, ip)
    // if (!passed) {
    //   return NextResponse.json({ error: 'turnstile_failed' }, { status: 400 })
    // }
  }

  const result = await authenticateAdmin({ db, email, password })

  if (!result.ok) {
    await writeAuditEntry(db, {
      actorKind: 'system',
      action: 'admin.login.failed',
      reason: result.error.kind,
      ip,
      userAgent,
      metadata: { attempted_email: email },
    })

    const status = result.error.kind === 'invalid_credentials' ? 401 : 403
    return NextResponse.json({ error: result.error.kind }, { status })
  }

  if (!e.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  // Temporary bypass — ADMIN_2FA_OPTIONAL=true skips the entire 2FA flow
  // (both the initial setup wizard and ongoing TOTP verification) so admins
  // get a session straight from password-only login. The flag defaults to
  // false; the operator must set it explicitly to opt in.
  // TODO: remove skip when going to production
  const skip2faSetup = Boolean(e.ADMIN_2FA_OPTIONAL)
  const secureCookie =
    req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'

  if (skip2faSetup) {
    const session = await issueSession(
      { secret: e.ADMIN_SESSION_SECRET, previousSecret: e.ADMIN_SESSION_SECRET_PREV ?? null },
      {
        db,
        adminId: result.value.adminId,
        role: result.value.primaryRole,
        ip,
        userAgent,
      },
    )

    await db
      .update(schema.admins)
      .set({ lastLoginAt: new Date(), lastLoginIp: ip || null })
      .where(eq(schema.admins.id, result.value.adminId))

    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: result.value.adminId,
      actorRole: result.value.primaryRole,
      action: 'admin.login.success',
      resourceKind: 'admin_session',
      resourceId: session.sessionId,
      reason: 'ADMIN_2FA_OPTIONAL bypass (dev only)',
      ip,
      userAgent,
    })

    const res = NextResponse.json({ ok: true, step: 'done', redirect: '/admin' })
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

  const purpose = result.value.totpEnabled ? 'totp_verify' : 'totp_setup'
  const pending = issuePending(e.ADMIN_SESSION_SECRET, {
    admin_id: result.value.adminId,
    primary_role: result.value.primaryRole,
    ip,
    ua: userAgent,
    purpose,
  })

  return NextResponse.json({
    ok: true,
    pending,
    step: result.value.totpEnabled ? 'verify_2fa' : 'setup_2fa',
    displayName: result.value.displayName,
    // docs/09 §5.4 — when true, the client must route the admin through
    // the password-reset wizard *before* the 2FA step. The pending token
    // can still be used to authorize the change-password endpoint.
    mustResetPassword: result.value.mustResetPassword,
  })
}
