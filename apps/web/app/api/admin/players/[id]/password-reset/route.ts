import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5.1 — admin-initiated password reset.
//
// Triggers the standard Better Auth `forgetPassword` flow on the player's
// behalf. The reset link is emailed (via the `sendResetPassword` adapter
// configured in apps/web/lib/auth.ts) — admins never see the token. The
// audit entry records that the request was admin-initiated so we know in
// the trail which resets were operator-initiated vs player-initiated.
//
// Permission: manager+ (it's a recovery aid, not a money-bounded action).

const body = z.object({
  reason: z.string().min(2).max(500),
  redirectTo: z.string().url().optional(),
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
    .select({ id: schema.players.id, email: schema.players.email })
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: player.email,
        redirectTo: parsed.redirectTo ?? '/reset-password',
      },
    })
  } catch (e) {
    // Better Auth swallows most errors as 200 to avoid email enumeration,
    // but if the email transport throws we surface it so the admin knows.
    return jsonError(500, 'reset_request_failed', e instanceof Error ? e.message : String(e))
  }

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.password_reset_request',
    resourceKind: 'player',
    resourceId: id,
    after: { sent_to: player.email },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true, sentTo: player.email })
}
