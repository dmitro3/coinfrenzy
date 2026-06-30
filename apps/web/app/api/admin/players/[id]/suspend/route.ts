import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  reason: z.string().min(2).max(500),
  durationHours: z.number().int().min(0).max(8760).nullable().optional(),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  const { id } = await ctx2.params

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db.select().from(schema.players).where(eq(schema.players.id, id)).limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  const previousStatus = player.status
  await db
    .update(schema.players)
    .set({
      status: 'suspended',
      statusReason: parsed.reason,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.suspend',
    resourceKind: 'player',
    resourceId: id,
    before: { status: previousStatus },
    after: { status: 'suspended', reason: parsed.reason },
    reason: parsed.reason,
    ip,
    userAgent,
    metadata: { duration_hours: parsed.durationHours ?? null },
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
