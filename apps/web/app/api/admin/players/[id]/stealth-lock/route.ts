import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §6.1 — stealth lock (a.k.a. "shadow ban").
//
// Difference from `suspend`:
//   - `suspend` flips players.status to 'suspended' and the player sees a
//     branded "your account is suspended" message at login. They KNOW
//     they were suspended.
//   - `stealth-lock` keeps players.status = 'active' from a public POV but
//     records `metadata.stealth_lock = { locked_at, reason, by_admin_id }`.
//     The Better Auth session.create.before hook (apps/web/lib/auth.ts)
//     reads that flag and silently fails the login with a generic
//     "incorrect credentials" error. The player can't tell whether they
//     mistyped their password or whether they've been locked.
//   - All existing sessions are revoked when we lock so the player is
//     kicked out of any open device.
//
// Use cases:
//   - Suspected collusion / multi-account abuse where we want to observe
//     instead of warn (so the actor doesn't realise we caught them).
//   - Fraud cases pending investigation.
//   - High-confidence bot accounts.
//
// Permission: manager+ to engage, manager+ to release.

const body = z.object({
  action: z.enum(['lock', 'unlock']),
  reason: z.string().min(2).max(500),
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
  const [player] = await db
    .select({
      id: schema.players.id,
      metadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  const now = new Date()
  const meta = (player.metadata ?? {}) as Record<string, unknown>
  const wasLocked = Boolean((meta.stealth_lock as { locked_at?: string } | undefined)?.locked_at)

  let nextMeta: Record<string, unknown>
  if (parsed.action === 'lock') {
    nextMeta = {
      ...meta,
      stealth_lock: {
        locked_at: now.toISOString(),
        reason: parsed.reason,
        by_admin_id: session.admin.id,
      },
    }
  } else {
    const { stealth_lock: _, ...rest } = meta
    nextMeta = rest
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.players)
      .set({ metadata: nextMeta, updatedAt: now })
      .where(eq(schema.players.id, id))
    if (parsed.action === 'lock') {
      // Boot any active sessions so the lock takes effect immediately.
      await tx.delete(schema.authSession).where(eq(schema.authSession.userId, id))
    }
  })

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: parsed.action === 'lock' ? 'player.stealth_lock' : 'player.stealth_unlock',
    resourceKind: 'player',
    resourceId: id,
    before: { stealth_locked: wasLocked },
    after: { stealth_locked: parsed.action === 'lock' },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true, stealthLocked: parsed.action === 'lock' })
}
