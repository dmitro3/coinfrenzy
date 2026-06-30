import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import {
  legal as coreLegal,
  createAfterCommitQueue,
  noopLogger,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  slug: z.enum(['tos', 'privacy']),
  version: z.number().int().min(1),
})

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const actor: Actor = { kind: 'player', playerId: session.player.id }
  const queue = createAfterCommitQueue(noopLogger)
  const ctx: Context = {
    db: getDb(),
    logger: noopLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const res = await coreLegal.acceptTerms(ctx, {
    playerId: session.player.id,
    slug: parsed.data.slug,
    version: parsed.data.version,
  })
  await queue.flush()

  if (!res.ok) {
    return NextResponse.json({ error: res.error.code, detail: res.error }, { status: 409 })
  }
  return NextResponse.json({ ok: true, slug: parsed.data.slug, ...res.value })
}
