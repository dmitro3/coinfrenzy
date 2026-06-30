import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'

import { categoryFor, recordPlayerEvent } from '@coinfrenzy/core/events'
import { getDb, withActor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { getPlayerSession } from '@/lib/player-session'

import { phoneOtpIdentifier } from '../../_otp-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  phone: z
    .string()
    .min(10)
    .regex(/^\+1\d{10}$/, 'Phone must be a US number in E.164 format (+1XXXXXXXXXX).'),
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

  const phone = parsed.phone
  const db = getDb()
  const identifier = phoneOtpIdentifier(session.player.id, phone)
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

  await withActor(session.player.id, 'player', null, async (tx) => {
    const [player] = await tx
      .select({ kycLevel: schema.players.kycLevel })
      .from(schema.players)
      .where(eq(schema.players.id, session.player.id))
      .limit(1)

    const nextKycLevel = Math.max(player?.kycLevel ?? 0, 1)

    await tx
      .update(schema.players)
      .set({
        phone,
        kycLevel: nextKycLevel,
        updatedAt: new Date(),
      })
      .where(eq(schema.players.id, session.player.id))

    await recordPlayerEvent(tx, {
      playerId: session.player.id,
      eventName: 'player.phone_verified',
      eventCategory: categoryFor('player.phone_verified'),
      payload: { playerId: session.player.id, phone },
    })
  })

  return NextResponse.json({
    data: { success: true, message: 'Phone verified successfully.' },
    errors: [],
  })
}
