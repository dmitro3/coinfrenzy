import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import {
  consoleLogger,
  createAfterCommitQueue,
  favorites as favoritesCore,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { withActor } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/03 §8.5 — player favorites API. Two methods:
//
// GET  → { gameIds: string[] }
//        Used by the hover-star on every game tile to know whether
//        to render the gold filled star or the empty outline. Also
//        powers the /favorites page.
//
// POST → { gameId: string, favorite?: boolean }
//        If `favorite` is omitted the row is toggled (single round-trip
//        from the client — preferred). When passed, the server forces
//        the requested state; useful for the immersive footer which
//        already knows its current pressed state.
//
// All reads + writes route through `withActor()` so RLS enforces
// "player can only see/modify their own rows" even if the API handler
// has a bug.

const postBody = z.object({
  gameId: z.string().uuid(),
  favorite: z.boolean().optional(),
})

export async function GET() {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ gameIds: [] satisfies string[] })
  }

  const rows = await withActor(session.player.id, 'player', null, async (tx) => {
    const ctx: Context = {
      db: tx,
      logger: consoleLogger,
      actor: { kind: 'player', playerId: session.player.id },
      reqId: randomUUID(),
      afterCommit: () => undefined,
    }
    return favoritesCore.list(ctx, session.player.id)
  })

  return NextResponse.json({
    gameIds: rows.map((r) => r.gameId),
  })
}

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let parsed: z.infer<typeof postBody>
  try {
    parsed = postBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const queue = createAfterCommitQueue(consoleLogger)
  const actor: Actor = { kind: 'player', playerId: session.player.id }

  const result = await withActor(session.player.id, 'player', null, async (tx) => {
    const ctx: Context = {
      db: tx,
      logger: consoleLogger,
      actor,
      reqId: randomUUID(),
      afterCommit: queue.push,
    }
    if (parsed.favorite === undefined) {
      return favoritesCore.toggle(ctx, {
        playerId: session.player.id,
        gameId: parsed.gameId,
      })
    }
    return favoritesCore.set(ctx, {
      playerId: session.player.id,
      gameId: parsed.gameId,
      favorite: parsed.favorite,
    })
  })

  await queue.flush()

  if (!result.ok) {
    const status = result.error.code === 'game_not_found' ? 404 : 400
    return NextResponse.json({ error: result.error.code }, { status })
  }

  return NextResponse.json({
    favorite: result.value.favorite,
    count: result.value.count,
  })
}
