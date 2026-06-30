import { NextResponse, type NextRequest } from 'next/server'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '@coinfrenzy/config'
import { auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { auth } from '@/lib/auth'
import { sendOtpEmail } from '../_otp-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5.1 + docs/02 §6 — player signup.
//
// Accepts BOTH the modal payload (email + base64 password + captchaToken
// + referralCode + isTermsAccepted) and the legacy full payload
// (email + plaintext password + firstName + lastName + state + dateOfBirth).
//
// After creating the account, a 6-digit OTP is sent to the email.
// The browser session is issued immediately as requested by the user.

const signupBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(512),
  captchaToken: z.string().optional(),
  turnstileToken: z.string().optional(),
  referralCode: z.string().max(80).optional(),
  isTermsAccepted: z.boolean().optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  state: z.string().length(2).optional(),
  phone: z.string().max(40).optional(),
  country: z.string().length(2).default('US'),
  emailConsent: z.boolean().optional(),
  smsConsent: z.boolean().optional(),
  attributedPromoCode: z.string().max(80).optional(),
})

function resolvePassword(raw: string): string {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    if (decoded.length >= 6 && /^[\x20-\x7e]+$/.test(decoded)) return decoded
  } catch {
    // not base64
  }
  return raw
}

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
  let raw: z.infer<typeof signupBody>
  try {
    raw = signupBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      {
        error: 'invalid_input',
        details: e instanceof z.ZodError ? e.flatten() : undefined,
      },
      { status: 400 },
    )
  }

  const email = raw.email.trim().toLowerCase()
  const password = resolvePassword(raw.password)
  const captchaToken = raw.captchaToken ?? raw.turnstileToken ?? null

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null

  const e = env()
  if (e.CF_TURNSTILE_SECRET_KEY) {
    if (!captchaToken) {
      return NextResponse.json(
        { error: 'turnstile_required', message: 'Security challenge is required.' },
        { status: 400 },
      )
    }
    const passed = await verifyTurnstileToken(e.CF_TURNSTILE_SECRET_KEY, captchaToken, ip ?? '')
    if (!passed) {
      return NextResponse.json(
        { error: 'turnstile_failed', message: 'Security challenge failed. Please try again.' },
        { status: 400 },
      )
    }
  }

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

  const displayName =
    raw.firstName && raw.lastName ? `${raw.firstName} ${raw.lastName}`.trim() : email.split('@')[0]

  let authResponse: Response
  try {
    authResponse = await auth.api.signUpEmail({
      body: { email, password, name: displayName },
      headers: req.headers,
      asResponse: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'signup_failed'
    return NextResponse.json({ error: 'signup_failed', message }, { status: 422 })
  }

  if (!authResponse.ok) {
    const body = await authResponse.text()
    return new NextResponse(body, {
      status: authResponse.status,
      headers: { 'content-type': authResponse.headers.get('content-type') ?? 'application/json' },
    })
  }

  const authPayload = (await authResponse.clone().json()) as { user?: { id?: string } }
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
      firstName: raw.firstName ?? null,
      lastName: raw.lastName ?? null,
      dateOfBirth: raw.dateOfBirth ?? null,
      phone: raw.phone ?? null,
      state: raw.state ?? null,
      country: raw.country,
      ip,
      emailConsent: raw.emailConsent ?? true,
      smsConsent: raw.smsConsent ?? false,
      attributedPromoCode: raw.attributedPromoCode ?? raw.referralCode ?? null,
    },
  })

  if (!profileResult.ok) {
    console.error('[signup] completePlayerProfile failed', { userId, error: profileResult.error })
  }

  const otp = String(randomInt(100000, 999999))
  const otpIdentifier = `otp:${email}`
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min

  const db = getDb()
  await db
    .delete(schema.authVerification)
    .where(eq(schema.authVerification.identifier, otpIdentifier))
  await db.insert(schema.authVerification).values({
    id: crypto.randomUUID(),
    identifier: otpIdentifier,
    value: otp,
    expiresAt,
  })

  try {
    await sendOtpEmail({ email, otp })
  } catch (err) {
    console.error('[signup] sendOtpEmail failed', {
      email,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const headers = new Headers()
  const setCookies = authResponse.headers.getSetCookie()
  for (const cookie of setCookies) {
    headers.append('set-cookie', cookie)
  }

  return NextResponse.json(
    {
      data: {
        user: { email, userId },
        success: true,
        message: 'Record created successfully',
      },
      errors: [],
    },
    { headers },
  )
}
