import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { withActor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema_ = z.object({ sessionId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema_.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  await withActor(session.player.id, 'player', null, async (tx) => {
    // Player can only revoke their own sessions.
    await tx
      .delete(schema.authSession)
      .where(
        and(
          eq(schema.authSession.id, parsed.data.sessionId),
          eq(schema.authSession.userId, session.player.id),
        ),
      )

    await audit.writeAuditEntry(tx, {
      actorKind: 'player',
      actorId: session.player.id,
      action: 'auth.session.revoked',
      resourceKind: 'auth_session',
      resourceId: null,
      reason: 'player_revoked',
      ip,
      userAgent,
      metadata: { sessionId: parsed.data.sessionId },
    })
  })

  return NextResponse.json({ ok: true })
}
