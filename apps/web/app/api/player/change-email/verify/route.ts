import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { getPlayerSession } from '@/lib/player-session'

import { changeEmailOtpIdentifier } from '../../_otp-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
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
  const db = getDb()
  const identifier = changeEmailOtpIdentifier(session.player.id, email)
  const now = new Date()

  const [record] = await db
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

  if (!record || record.value !== parsed.otp) {
    return NextResponse.json(
      { error: 'invalid_otp', message: 'The code is invalid or has expired.' },
      { status: 400 },
    )
  }

  await db.delete(schema.authVerification).where(eq(schema.authVerification.id, record.id))

  const taken = await db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .where(eq(schema.authUser.email, email))
    .limit(1)

  if (taken.length > 0 && taken[0]!.id !== session.player.id) {
    return NextResponse.json(
      { error: 'email_taken', message: 'This email is already in use.' },
      { status: 400 },
    )
  }

  await db
    .update(schema.authUser)
    .set({ email, emailVerified: true, updatedAt: new Date() })
    .where(eq(schema.authUser.id, session.player.id))

  await db
    .update(schema.players)
    .set({ email, updatedAt: new Date() })
    .where(eq(schema.players.id, session.player.id))

  return NextResponse.json({
    data: { success: true, message: 'Email updated successfully.' },
    errors: [],
  })
}
