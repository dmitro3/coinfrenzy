import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { audit as auditMod } from '@coinfrenzy/core'
import { canManageBlocklists } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §4 — admin blocklist management.
// POST /api/admin/blocked-domains  -> add a domain (manager+)
// (DELETE lives at /api/admin/blocked-domains/[domain] for master-only removal.)
//
// Domains are stored lowercase. Adding an already-present row updates the
// reason — operators sometimes re-classify a domain after fraud review.

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

const postBody = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => DOMAIN_RE.test(s), { message: 'invalid_domain' }),
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
    .insert(schema.blockedDomains)
    .values({
      domain: parsed.domain,
      reason: parsed.reason.trim(),
      addedBy: adminId,
    })
    .onConflictDoUpdate({
      target: schema.blockedDomains.domain,
      set: { reason: parsed.reason.trim(), addedBy: adminId },
    })

  await auditMod.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: actor.kind === 'admin' ? actor.role : null,
    action: 'blocklist.domain.added',
    resourceKind: 'blocked_domain',
    resourceId: parsed.domain,
    after: { reason: parsed.reason },
    ip: actor.kind === 'admin' ? actor.ip : null,
    requestId: built.data.ctx.reqId,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true, domain: parsed.domain })
}
