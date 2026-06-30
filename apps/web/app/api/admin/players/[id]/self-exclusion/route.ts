import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §3.6 — admin set / extend a player's self-exclusion.
//
// Self-exclusion is the strongest RG tool: while active, the player
// cannot log in, deposit, or play. Setting it requires manager+, lifting
// it requires master (you should not be able to "undo" a player's own
// self-exclusion decision lightly). Both actions are audited.
//
// PUT  — set or extend the exclusion. Idempotent: passing the same
//        until-date returns 200 with noChange: true.
// DELETE — lift the exclusion (master-only).

const putBody = z.object({
  /** ISO timestamp until which the exclusion holds. Null = permanent. */
  until: z.union([z.string().datetime(), z.null()]),
  reason: z.string().trim().min(3).max(500),
})

export async function PUT(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  const { id } = await ctx2.params

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db.select().from(schema.players).where(eq(schema.players.id, id)).limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  const before = player.rgSelfExcludedUntil?.toISOString() ?? null
  const after = parsed.until
  if (before === after) return NextResponse.json({ ok: true, noChange: true })

  const untilDate = parsed.until ? new Date(parsed.until) : null
  await db
    .update(schema.players)
    .set({ rgSelfExcludedUntil: untilDate, status: 'self_excluded', updatedAt: new Date() })
    .where(eq(schema.players.id, id))

  await db.insert(schema.complianceFlags).values({
    playerId: id,
    flagType: 'self_exclusion',
    severity: 'block',
    reason: parsed.reason,
    expiresAt: untilDate,
    createdBy: session.admin.id,
  })

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.self_exclusion.set',
    resourceKind: 'player',
    resourceId: id,
    before: { rgSelfExcludedUntil: before },
    after: { rgSelfExcludedUntil: after },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true, rgSelfExcludedUntil: after })
}

const deleteBody = z.object({
  reason: z.string().trim().min(10).max(500),
})

export async function DELETE(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  // Lifting self-exclusion is master-only. The doc rationale: it must
  // never be a routine support action because the social-casino regulators
  // expect a clear paper trail when SE is reversed.
  if (!coreAuth.hasAtLeast(session.payload.role, 'master')) {
    return jsonError(403, 'forbidden', { required: 'master' })
  }

  const { id } = await ctx2.params

  let parsed: z.infer<typeof deleteBody>
  try {
    parsed = deleteBody.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db.select().from(schema.players).where(eq(schema.players.id, id)).limit(1)
  if (!player) return jsonError(404, 'player_not_found')
  if (!player.rgSelfExcludedUntil && player.status !== 'self_excluded') {
    return jsonError(409, 'not_self_excluded')
  }

  const before = player.rgSelfExcludedUntil?.toISOString() ?? null
  await db
    .update(schema.players)
    .set({
      rgSelfExcludedUntil: null,
      status: player.status === 'self_excluded' ? 'active' : player.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, id))

  // Mark the active self-exclusion compliance flag(s) as cleared.
  await db
    .update(schema.complianceFlags)
    .set({
      clearedAt: new Date(),
      clearedBy: session.admin.id,
      clearedReason: parsed.reason,
    })
    .where(
      and(
        eq(schema.complianceFlags.playerId, id),
        eq(schema.complianceFlags.flagType, 'self_exclusion'),
        isNull(schema.complianceFlags.clearedAt),
      ),
    )

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.self_exclusion.lift',
    resourceKind: 'player',
    resourceId: id,
    before: { rgSelfExcludedUntil: before, status: player.status },
    after: { rgSelfExcludedUntil: null, status: 'active' },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
