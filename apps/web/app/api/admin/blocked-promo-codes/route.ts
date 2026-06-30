import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { audit as auditMod } from '@coinfrenzy/core'
import { canManageBlocklists } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §4 — admin promo-code blocklist management.
// Codes are uppercased and stripped before storage so the bonus engine's
// `code = $1` lookup always matches what an operator typed.

const CODE_RE = /^[A-Z0-9_-]{2,40}$/

const postBody = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .transform((s) => s.trim().toUpperCase())
    .refine((s) => CODE_RE.test(s), { message: 'invalid_code' }),
  reason: z.string().min(1).max(200),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canManageBlocklists(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof postBody>
  try {
    parsed = postBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const actor = built.data.ctx.actor
  const adminId = actor.kind === 'admin' ? actor.adminId : null

  await built.data.ctx.db
    .insert(schema.blockedPromoCodes)
    .values({
      code: parsed.code,
      reason: parsed.reason.trim(),
      addedBy: adminId,
    })
    .onConflictDoUpdate({
      target: schema.blockedPromoCodes.code,
      set: { reason: parsed.reason.trim(), addedBy: adminId },
    })

  await auditMod.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: actor.kind === 'admin' ? actor.role : null,
    action: 'blocklist.promo_code.added',
    resourceKind: 'blocked_promo_code',
    resourceId: parsed.code,
    after: { reason: parsed.reason },
    ip: actor.kind === 'admin' ? actor.ip : null,
    requestId: built.data.ctx.reqId,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true, code: parsed.code })
}
