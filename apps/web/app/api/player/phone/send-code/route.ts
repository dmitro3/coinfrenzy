import { NextResponse, type NextRequest } from 'next/server'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { adapters } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
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
  const otp = String(randomInt(100000, 999999))
  const identifier = phoneOtpIdentifier(session.player.id, phone)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  const db = getDb()

  await db.delete(schema.authVerification).where(eq(schema.authVerification.identifier, identifier))
  await db.insert(schema.authVerification).values({
    id: crypto.randomUUID(),
    identifier,
    value: otp,
    expiresAt,
  })

  const sms = await adapters.twilio.getTwilioClient().sendSms({
    to: phone,
    body: `Your CoinFrenzy verification code is: ${otp}. It expires in 10 minutes.`,
  })

  if (sms.status === 'failed') {
    return NextResponse.json(
      { error: 'sms_failed', message: 'Could not send verification code. Try again shortly.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    data: { success: true, message: 'Verification code sent.' },
    errors: [],
  })
}
