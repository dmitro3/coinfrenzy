import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { auth } from '@coinfrenzy/core'
import { withActor } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  gender: z.string().nullable().optional(),
  addressLine1: z.string(),
  city: z.string(),
  postalCode: z.string(),
  state: z.string(),
})

export async function PATCH(req: NextRequest) {
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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const gender =
    parsed.gender && parsed.gender.length > 0 ? (parsed.gender as auth.GenderOption) : null

  const result = await withActor(session.player.id, 'player', null, (tx) =>
    auth.updatePersonalDetails(tx, {
      playerId: session.player.id,
      details: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        dateOfBirth: parsed.dateOfBirth,
        gender,
        addressLine1: parsed.addressLine1,
        city: parsed.city,
        postalCode: parsed.postalCode,
        state: parsed.state,
      },
      ip,
      userAgent,
    }),
  )

  if (!result.ok) {
    if (result.error.kind === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json(
      {
        error: result.error.kind,
        field: result.error.field,
        message: result.error.message,
      },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true, profile: result.value })
}
