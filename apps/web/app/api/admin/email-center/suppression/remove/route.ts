import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit as auditMod } from '@coinfrenzy/core'
import { canDeleteSuppression } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST body shape avoids encoding pitfalls with `@` / `+` in URL paths.
 * Per docs/09 §3 + permissions.ts, removing a suppression entry is
 * MASTER-only — bounce / complaint / TCPA stops should not be reversed
 * by a marketing employee.
 */
const removeBody = z.object({
  emailOrPhone: z.string().min(3).max(200),
  /** Required free-text justification — read in audit reviews. */
  reason: z.string().min(3).max(500),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canDeleteSuppression(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof removeBody>
  try {
    parsed = removeBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const key = parsed.emailOrPhone.trim().toLowerCase()

  // Capture the row we're about to remove so we can put it in the audit
  // log's `before` snapshot.
  const existing = await built.data.ctx.db
    .select({
      emailOrPhone: schema.crmSuppression.emailOrPhone,
      reason: schema.crmSuppression.reason,
      source: schema.crmSuppression.source,
      addedAt: schema.crmSuppression.addedAt,
    })
    .from(schema.crmSuppression)
    .where(eq(schema.crmSuppression.emailOrPhone, key))
    .limit(1)
  if (!existing[0]) return jsonError(404, 'not_found')

  await built.data.ctx.db
    .delete(schema.crmSuppression)
    .where(eq(schema.crmSuppression.emailOrPhone, key))

  const actor = built.data.ctx.actor
  await auditMod.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: actor.kind === 'admin' ? actor.adminId : null,
    actorRole: actor.kind === 'admin' ? actor.role : null,
    action: 'crm.suppression.removed',
    resourceKind: 'crm_suppression',
    resourceId: key,
    before: {
      emailOrPhone: existing[0].emailOrPhone,
      reason: existing[0].reason,
      source: existing[0].source,
      addedAt: existing[0].addedAt.toISOString(),
    },
    reason: parsed.reason,
    ip: actor.kind === 'admin' ? actor.ip : null,
    requestId: built.data.ctx.reqId,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true })
}
