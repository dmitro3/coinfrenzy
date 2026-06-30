import { NextResponse, type NextRequest } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Notes are stored as audit_log rows with action='player.note' so we keep a
// single append-only history without adding a new schema table. The metadata
// field carries the note text + author.

const body = z.object({ note: z.string().min(1).max(4000) })

export async function GET(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await ctx2.params
  const db = getDb()
  const rows = await db
    .select({
      id: schema.auditLog.id,
      occurredAt: schema.auditLog.occurredAt,
      actorId: schema.auditLog.actorId,
      actorRole: schema.auditLog.actorRole,
      metadata: schema.auditLog.metadata,
    })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, 'player.note'), eq(schema.auditLog.resourceId, id)))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(100)

  return NextResponse.json({
    notes: rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      actorId: r.actorId,
      actorRole: r.actorRole,
      note: (r.metadata as { note?: string } | null)?.note ?? '',
    })),
  })
}

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
  const [player] = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.note',
    resourceKind: 'player',
    resourceId: id,
    ip,
    userAgent,
    metadata: { note: parsed.note },
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
