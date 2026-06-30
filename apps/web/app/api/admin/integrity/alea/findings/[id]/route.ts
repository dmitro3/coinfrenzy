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
  action: z.enum(['resolved', 'ignored', 'replayed']),
  notes: z.string().trim().min(1).max(2_000),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  let parsed
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', {
      details: e instanceof z.ZodError ? e.flatten() : undefined,
    })
  }

  const { id } = await ctx2.params
  const db = getDb()
  const [finding] = await db
    .select()
    .from(schema.aleaReconciliationFindings)
    .where(eq(schema.aleaReconciliationFindings.id, id))
    .limit(1)
  if (!finding) return jsonError(404, 'finding_not_found')
  if (finding.status !== 'open') return jsonError(409, 'finding_already_resolved')

  await db
    .update(schema.aleaReconciliationFindings)
    .set({
      status: parsed.action,
      resolvedBy: session.admin.id,
      resolvedAt: new Date(),
      resolutionNotes: parsed.notes,
    })
    .where(eq(schema.aleaReconciliationFindings.id, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: `alea_reconciliation_finding.${parsed.action}`,
    resourceKind: 'alea_reconciliation_finding',
    resourceId: id,
    before: { status: 'open' },
    after: { status: parsed.action, notes: parsed.notes },
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
