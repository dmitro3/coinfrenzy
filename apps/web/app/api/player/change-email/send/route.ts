import { NextResponse, type NextRequest } from 'next/server'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { getPlayerSession } from '@/lib/player-session'

import { changeEmailOtpIdentifier, sendChangeEmailOtpEmail } from '../../_otp-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized', message: 'Not logged in' }, { status: 401 })
  }

  let parsed: z.output<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const email = parsed.email.trim().toLowerCase()
  if (email === session.player.email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: 'same_email', message: 'That is already your email address.' },
      { status: 400 },
    )
  }

  const db = getDb()

  const taken = await db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .where(eq(schema.authUser.email, email))
    .limit(1)

  if (taken.length > 0) {
    return NextResponse.json(
      { error: 'email_taken', message: 'This email is already in use.' },
      { status: 400 },
    )
  }

  const otp = String(randomInt(100000, 999999))
  const identifier = changeEmailOtpIdentifier(session.player.id, email)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await db.delete(schema.authVerification).where(eq(schema.authVerification.identifier, identifier))
  await db.insert(schema.authVerification).values({
    id: crypto.randomUUID(),
    identifier,
    value: otp,
    expiresAt,
  })

  try {
    await sendChangeEmailOtpEmail({ email, otp })
  } catch (err) {
    console.error('[change-email/send] email failed', err)
    return NextResponse.json(
      { error: 'email_failed', message: 'Failed to send verification email.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    data: { success: true, message: 'Verification code sent.' },
    errors: [],
  })
}
