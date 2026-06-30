import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { passwordResetOtpIdentifier } from '../_otp-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const resetBody = z
  .object({
    email: z.string().email(),
    otp: z.string().length(6),
    password: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  })

export async function POST(req: NextRequest) {
  let parsed: z.output<typeof resetBody>
  try {
    parsed = resetBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const email = parsed.email.trim().toLowerCase()
  const db = getDb()
  const now = new Date()
  const identifier = passwordResetOtpIdentifier(email)

  const existingOtp = await db
    .select({
      id: schema.authVerification.id,
      value: schema.authVerification.value,
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

  const users = await db
    .select({ id: schema.authUser.id })
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

  const hashed = await hashPassword(parsed.password)

  const updated = await db
    .update(schema.authAccount)
    .set({ password: hashed, updatedAt: now })
    .where(
      and(eq(schema.authAccount.userId, user.id), eq(schema.authAccount.providerId, 'credential')),
    )
    .returning({ id: schema.authAccount.id })

  if (!updated[0]) {
    return NextResponse.json(
      { error: 'account_not_found', message: 'No password account found for this email.' },
      { status: 404 },
    )
  }

  await db.delete(schema.authVerification).where(eq(schema.authVerification.id, record.id))

  return NextResponse.json({
    data: { success: true, message: 'Password reset successfully.' },
    errors: [],
  })
}
