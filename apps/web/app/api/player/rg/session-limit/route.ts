import { NextResponse } from 'next/server'
import { z } from 'zod'

import { compliance } from '@coinfrenzy/core'
import { withActor } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  nextMinutes: z.union([z.number().int().min(1).max(1440), z.null()]),
})

export async function POST(req: Request) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const result = await withActor(session.player.id, 'player', null, (tx) =>
    compliance.updateSessionLimit(tx, {
      playerId: session.player.id,
      nextMinutes: parsed.data.nextMinutes,
      ip,
      userAgent,
    }),
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error.kind }, { status: 400 })
  }

  return NextResponse.json({
    status: result.value.status,
    applyAt: result.value.applyAt?.toISOString() ?? null,
  })
}
