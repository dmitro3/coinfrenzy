import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'

import { compliance } from '@coinfrenzy/core'
import { withActor } from '@coinfrenzy/db/client'

import { auth } from '@/lib/auth'
import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  duration: z.enum(['1d', '7d', '30d', '1y', 'permanent']),
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
    compliance.selfExclude(tx, {
      playerId: session.player.id,
      duration: parsed.data.duration,
      ip,
      userAgent,
    }),
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error.kind }, { status: 400 })
  }

  // Revoke ALL Better Auth sessions for this user (docs/09 §7.1 step 2).
  // Better Auth exposes a revokeSessions endpoint we can call server-side.
  try {
    const h = await headers()
    await auth.api.revokeSessions({ headers: h })
  } catch (e) {
    console.warn('[rg.self-exclude] revokeSessions failed', e)
  }

  return NextResponse.json({
    expiresAt: result.value.expiresAt?.toISOString() ?? null,
    permanent: result.value.permanent,
  })
}
