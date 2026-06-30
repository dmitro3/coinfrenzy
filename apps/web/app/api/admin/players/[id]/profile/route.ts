import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §3 — admin-side profile edit. The fields exposed here are the
// ones support hears about most frequently in tickets ("I mistyped my
// email at signup", "I moved to a new state", "they spelled my name
// wrong"). Anything more sensitive (KYC level, status, RG limits) has its
// own dedicated endpoint with stricter auth and richer auditing.

const body = z
  .object({
    email: z.string().email().max(254).optional(),
    username: z.string().min(2).max(48).nullable().optional(),
    displayName: z.string().min(1).max(100).nullable().optional(),
    firstName: z.string().min(1).max(100).nullable().optional(),
    lastName: z.string().min(1).max(100).nullable().optional(),
    phone: z
      .string()
      .min(7)
      .max(32)
      .regex(/^[+]?[0-9 ()-]+$/, 'invalid phone format')
      .nullable()
      .optional(),
    state: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/, 'state must be a 2-letter code')
      .nullable()
      .optional(),
    emailConsent: z.boolean().optional(),
    smsConsent: z.boolean().optional(),
    reason: z.string().min(2).max(500),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== 'reason' && v[k as keyof typeof v] !== undefined),
    { message: 'no editable fields supplied' },
  )

export async function PATCH(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
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

  // Email changes must propagate to auth_user so the player can still log
  // in. Wrap both writes in a transaction to keep the (auth_user, players)
  // invariant intact even if one side fails.
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'reason') continue
    if (v === undefined) continue
    const prev = (player as unknown as Record<string, unknown>)[k]
    if (prev === v) continue
    before[k] = prev
    after[k] = v
    updates[k] = v
  }

  if (Object.keys(after).length === 0) {
    return NextResponse.json({ ok: true, noop: true })
  }

  await db.transaction(async (tx) => {
    await tx.update(schema.players).set(updates).where(eq(schema.players.id, id))
    if (parsed.email !== undefined && parsed.email !== player.email) {
      await tx
        .update(schema.authUser)
        .set({ email: parsed.email, updatedAt: new Date() })
        .where(eq(schema.authUser.id, id))
    }
  })

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.profile_edit',
    resourceKind: 'player',
    resourceId: id,
    before,
    after,
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true, changed: Object.keys(after) })
}
