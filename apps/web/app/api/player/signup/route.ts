import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '@coinfrenzy/config'
import { auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5.1 + docs/02 §6 — player signup.
//
// Wraps Better Auth's email/password signup with our domain provisioning
// step. Better Auth creates the `auth_user` row (and auto-signs the
// player in via the session cookie). The `databaseHooks.user.create.after`
// hook creates the minimal `players` row + GC/SC wallets. We then call
// `coreAuth.completePlayerProfile` here to fill in the profile data
// (firstName/state/consent flags/etc.) on the players row.
//
// We forward all set-cookie headers from Better Auth's response so the
// session lands on the browser exactly as `auth.api.signUpEmail` set it.

const signupBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.string().length(2),
  phone: z.string().max(40).optional(),
  country: z.string().length(2).default('US'),
  emailConsent: z.boolean().optional(),
  smsConsent: z.boolean().optional(),
  attributedPromoCode: z.string().max(80).optional(),
  turnstileToken: z.string().optional(),
})

async function verifyTurnstileToken(
  secretKey: string,
  token: string,
  ip: string,
): Promise<boolean> {
  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  })
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) return false
  const json = (await res.json().catch(() => ({}))) as { success?: boolean }
  return json.success === true
}

export async function POST(req: NextRequest) {
  let parsed
  try {
    parsed = signupBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      {
        error: 'invalid_input',
        details: e instanceof z.ZodError ? e.flatten() : undefined,
      },
      { status: 400 },
    )
  }

  const displayName = `${parsed.firstName} ${parsed.lastName}`.trim()
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null

  // Cloudflare Turnstile verification — runs before any DB work.
  const e = env()
  if (e.CF_TURNSTILE_SECRET_KEY) {
    if (!parsed.turnstileToken) {
      return NextResponse.json(
        { error: 'turnstile_required', message: 'Security challenge is required.' },
        { status: 400 },
      )
    }
    const passed = await verifyTurnstileToken(
      e.CF_TURNSTILE_SECRET_KEY,
      parsed.turnstileToken,
      ip ?? '',
    )
    if (!passed) {
      return NextResponse.json(
        { error: 'turnstile_failed', message: 'Security challenge failed. Please try again.' },
        { status: 400 },
      )
    }
  }

  // Pre-flight: refuse signups whose email/domain is on the admin blocklist.
  // Without this the /admin/domain-blocking page is decorative — the
  // operator can add disposable providers but signup wouldn't notice.
  const email = parsed.email.trim().toLowerCase()
  const domain = email.includes('@') ? email.slice(email.indexOf('@') + 1) : null
  if (domain) {
    const db = getDb()
    const [emailHit] = await db
      .select({ src: schema.blockedEmails.email })
      .from(schema.blockedEmails)
      .where(eq(schema.blockedEmails.email, email))
      .limit(1)
    const [domainHit] = await db
      .select({ src: schema.blockedDomains.domain })
      .from(schema.blockedDomains)
      .where(eq(schema.blockedDomains.domain, domain))
      .limit(1)
    if (emailHit || domainHit) {
      return NextResponse.json(
        {
          error: 'email_not_allowed',
          message: 'This email address is not permitted. Please use a different provider.',
        },
        { status: 422 },
      )
    }
  }

  // Step 1: create auth_user (+ session cookie via autoSignIn). Better
  // Auth returns a Response with set-cookie headers when asResponse=true.
  let authResponse: Response
  try {
    authResponse = await auth.api.signUpEmail({
      body: {
        email: parsed.email.trim().toLowerCase(),
        password: parsed.password,
        name: displayName,
      },
      headers: req.headers,
      asResponse: true,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'signup_failed'
    return NextResponse.json({ error: 'signup_failed', message }, { status: 422 })
  }

  if (!authResponse.ok) {
    // Forward the Better Auth error body and status so the form can
    // surface specific failure reasons (e.g. "email already in use").
    const body = await authResponse.text()
    return new NextResponse(body, {
      status: authResponse.status,
      headers: {
        'content-type': authResponse.headers.get('content-type') ?? 'application/json',
      },
    })
  }

  // Step 2: complete the players profile that the post-create hook
  // provisioned with placeholders.
  const authPayload = (await authResponse.clone().json()) as {
    user?: { id?: string }
  }
  const userId = authPayload.user?.id
  if (!userId) {
    return NextResponse.json(
      { error: 'signup_failed', message: 'auth user id missing from response' },
      { status: 500 },
    )
  }

  const profileResult = await coreAuth.completePlayerProfile(getDb(), {
    playerId: userId,
    extras: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dateOfBirth: parsed.dateOfBirth,
      phone: parsed.phone ?? null,
      state: parsed.state,
      country: parsed.country,
      ip,
      emailConsent: parsed.emailConsent ?? true,
      smsConsent: parsed.smsConsent ?? false,
      attributedPromoCode: parsed.attributedPromoCode ?? null,
    },
  })

  if (!profileResult.ok) {
    // Auth user + minimal players row already exist; surface the error
    // but the session cookie below will still let them sign in. They'll
    // be prompted to complete their profile on next load.
    console.error('[signup] completePlayerProfile failed', {
      userId,
      error: profileResult.error,
    })
  }

  // Forward Better Auth's set-cookie headers so the session lands on the
  // browser. The body is the original Better Auth signup payload.
  const headers = new Headers()
  authResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      headers.append('set-cookie', value)
    }
  })
  headers.set('content-type', 'application/json')

  return new NextResponse(
    JSON.stringify({
      ok: true,
      blockedState: profileResult.ok ? profileResult.value.blockedState : false,
      user: authPayload.user,
    }),
    { status: 200, headers },
  )
}
