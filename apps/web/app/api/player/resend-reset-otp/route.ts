import { NextResponse, type NextRequest } from 'next/server'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import {
  PASSWORD_RESET_OTP_TTL_MS,
  passwordResetOtpIdentifier,
  sendPasswordResetOtpEmail,
} from '../_otp-helpers'
import { getPasswordResetCooldown } from '../_password-reset-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const resendBody = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  let parsed: z.output<typeof resendBody>
  try {
    parsed = resendBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const email = parsed.email.trim().toLowerCase()
  const db = getDb()
  const otpExpiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS)

  const users = await db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .where(eq(schema.authUser.email, email))
    .limit(1)

  if (!users[0]) {
    return NextResponse.json({
      data: {
        success: true,
        message: 'A new reset code has been sent.',
        otpExpiresAt: otpExpiresAt.toISOString(),
      },
      errors: [],
    })
  }

  const cooldown = await getPasswordResetCooldown(db, email)
  if (!cooldown.allowed) {
    return NextResponse.json({ error: 'rate_limited', message: cooldown.message }, { status: 401 })
  }

  const otp = String(randomInt(100000, 999999))
  const identifier = passwordResetOtpIdentifier(email)

  await db.delete(schema.authVerification).where(eq(schema.authVerification.identifier, identifier))

  await db.insert(schema.authVerification).values({
    id: crypto.randomUUID(),
    identifier,
    value: otp,
    expiresAt: otpExpiresAt,
  })

  try {
    await sendPasswordResetOtpEmail({ email, otp })
  } catch (err) {
    console.error('[resend-reset-otp] sendPasswordResetOtpEmail failed', {
      email,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'email_failed', message: 'Failed to send reset code.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    data: {
      success: true,
      message: 'A new reset code has been sent.',
      otpExpiresAt: otpExpiresAt.toISOString(),
    },
    errors: [],
  })
}
