import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod'

import { consoleLogger, createAfterCommitQueue, type Actor, type Context } from '@coinfrenzy/core'
import { bonus as bonusEngine } from '@coinfrenzy/core'
import { canManageBonuses } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/06 §13 — `promotion` / `admin_added_sc` trigger sites. The admin
// picks a template + player and we call the standard award path with
// adminId set so the audit log records the operator.

const body = z.object({
  bonusId: z.string().uuid(),
  // Preferred: resolved playerId from the search picker.
  playerId: z.string().uuid().nullable().optional(),
  // Legacy: free-text email / username / UUID. Server resolves it. Kept
  // so older integrations / scripts continue to work.
  playerQuery: z.string().min(1).max(255).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageBonuses(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()

  // Resolve the player. Prefer the explicit playerId from the picker;
  // fall back to a free-text query against email / username / UUID.
  let playerId: string | null = parsed.playerId ?? null
  if (!playerId) {
    const query = (parsed.playerQuery ?? '').trim()
    if (!query) {
      return NextResponse.json({ error: 'player_required' }, { status: 400 })
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)
    const lowered = query.toLowerCase()
    const rows = await db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(
        isUuid
          ? eq(schema.players.id, query)
          : or(eq(schema.players.email, lowered), eq(schema.players.username, lowered)),
      )
      .limit(1)
    playerId = rows[0]?.id ?? null
  }

  if (!playerId) {
    return NextResponse.json({ error: 'player_not_found' }, { status: 404 })
  }

  const players = await db
    .select({ id: schema.players.id, email: schema.players.email, status: schema.players.status })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  const player = players[0]
  if (!player) {
    return NextResponse.json({ error: 'player_not_found' }, { status: 404 })
  }

  const meta = await getRequestMeta()
  const actor: Actor = {
    kind: 'admin',
    adminId: session.admin.id,
    role: session.payload.role,
    ip: meta.ip,
  }
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await bonusEngine.award(ctx, {
    playerId: player.id,
    bonusId: parsed.bonusId,
    sourceKind: 'admin_manual',
    sourceId: `${session.admin.id}:${player.id}:${parsed.bonusId}:${Date.now()}`,
    adminId: session.admin.id,
    reason: parsed.reason ?? null,
  })

  await queue.flush()

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code, reason: result.error.reason },
      { status: 400 },
    )
  }
  return NextResponse.json(result.value)
}
