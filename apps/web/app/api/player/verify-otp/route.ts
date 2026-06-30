import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const verifyBody = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
})

export async function POST(req: NextRequest) {
  let parsed: z.output<typeof verifyBody>
  try {
    parsed = verifyBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const email = parsed.email.trim().toLowerCase()
  const db = getDb()

  // 1. Verify OTP
  const identifier = `otp:${email}`
  const now = new Date()

  const existingOtp = await db
    .select({
      id: schema.authVerification.id,
      value: schema.authVerification.value,
      expiresAt: schema.authVerification.expiresAt,
    })
    .from(schema.authVerification)
    .where(
      and(
        eq(schema.authVerification.identifier, identifier),
        gt(schema.authVerification.expiresAt, now),
      ),
    )
    .limit(1)

  const record = existingOtp[0]
  if (!record || record.value !== parsed.otp) {
    return NextResponse.json(
      { error: 'invalid_otp', message: 'The code is invalid or has expired.' },
      { status: 400 },
    )
  }

  // OTP verified, delete it to prevent reuse
  await db.delete(schema.authVerification).where(eq(schema.authVerification.id, record.id))

  // 2. Fetch the user
  const users = await db
    .select({ id: schema.authUser.id, emailVerified: schema.authUser.emailVerified })
    .from(schema.authUser)
    .where(eq(schema.authUser.email, email))
    .limit(1)

  const user = users[0]
  if (!user) {
    return NextResponse.json(
      { error: 'user_not_found', message: 'No account found with this email.' },
      { status: 404 },
    )
  }

  // Mark email as verified if not already
  if (!user.emailVerified) {
    await db
      .update(schema.authUser)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(schema.authUser.id, user.id))
  }

  // 3. Check if they have a username on the player row
  const players = await db
    .select({ username: schema.players.username })
    .from(schema.players)
    .where(eq(schema.players.id, user.id))
    .limit(1)

  const player = players[0]
  const hasUsername = Boolean(player && player.username)

  // Since the session was already issued during signup, we simply return success.
  return NextResponse.json(
    {
      data: {
        user: {
          userId: user.id,
          email,
          isEmailVerified: true,
          username: player?.username ?? null,
        },
        success: true,
        message: 'Email Verified Successfully!',
        hasUsername,
      },
      errors: [],
    },
    { status: 200 },
  )
}
