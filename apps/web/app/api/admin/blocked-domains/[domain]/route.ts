import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit as auditMod } from '@coinfrenzy/core'
import { canDeleteBlocklists } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §4 — master-only blocklist removal. Justification required so
// the audit trail explains why a once-blocked domain is being re-allowed.

const bodySchema = z.object({
  justification: z.string().min(3).max(500),
})

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canDeleteBlocklists(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden_master_only')
  }

  const { domain: rawDomain } = await params
  const domain = decodeURIComponent(rawDomain).trim().toLowerCase()
  if (!domain) return jsonError(400, 'invalid_input')

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const [existing] = await built.data.ctx.db
    .select({
      domain: schema.blockedDomains.domain,
      reason: schema.blockedDomains.reason,
    })
    .from(schema.blockedDomains)
    .where(eq(schema.blockedDomains.domain, domain))
    .limit(1)

  if (!existing) return jsonError(404, 'not_found')

  await built.data.ctx.db
    .delete(schema.blockedDomains)
    .where(eq(schema.blockedDomains.domain, domain))

  const actor = built.data.ctx.actor
  await auditMod.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: actor.kind === 'admin' ? actor.adminId : null,
    actorRole: actor.kind === 'admin' ? actor.role : null,
    action: 'blocklist.domain.removed',
    resourceKind: 'blocked_domain',
    resourceId: domain,
    before: { reason: existing.reason },
    reason: parsed.justification,
    ip: actor.kind === 'admin' ? actor.ip : null,
    requestId: built.data.ctx.reqId,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true, domain })
}
