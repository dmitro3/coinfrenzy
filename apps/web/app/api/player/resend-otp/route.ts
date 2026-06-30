import { NextResponse, type NextRequest } from 'next/server'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { sendOtpEmail } from '../_otp-helpers'

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

  // Make sure the user actually exists
  const users = await db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .where(eq(schema.authUser.email, email))
    .limit(1)

  if (!users[0]) {
    // Return success to avoid email enumeration
    return NextResponse.json({
      data: { success: true, message: 'The verification link has been resent.' },
      errors: [],
    })
  }

  // Generate new OTP
  const otp = String(randomInt(100000, 999999))
  const identifier = `otp:${email}`
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  // Replace existing OTP
  await db.delete(schema.authVerification).where(eq(schema.authVerification.identifier, identifier))

  await db.insert(schema.authVerification).values({
    id: crypto.randomUUID(),
    identifier,
    value: otp,
    expiresAt,
  })

  // Send email
  try {
    await sendOtpEmail({ email, otp })
  } catch (err) {
    console.error('[resend-otp] sendOtpEmail failed', {
      email,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'email_failed', message: 'Failed to send verification email.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    data: { success: true, message: 'The verification link has been resent.' },
    errors: [],
  })
}
