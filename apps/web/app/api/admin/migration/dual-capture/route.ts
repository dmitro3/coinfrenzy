import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { migration } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'
import { audit } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/13 §6.1 — webhook dual-capture toggle. Master-only and audited.
// Flipping ON starts the T-30 capture window. Flipping OFF should ONLY
// happen after the cutover replay tool has drained the captured rows.

const putBody = z.object({
  enabled: z.boolean(),
  providers: z.array(z.enum(['finix', 'alea', 'footprint'])).optional(),
  reason: z.string().min(3).max(500),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden')
  }
  const cfg = await migration.getDualCaptureConfig(built.data.ctx.db)
  return NextResponse.json({ ok: true, config: cfg })
}

export async function PUT(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const before = await migration.getDualCaptureConfig(built.data.ctx.db)
  const updated = await migration.setDualCaptureConfig(
    built.data.ctx.db,
    { enabled: parsed.enabled, providers: parsed.providers },
    built.data.session.admin.id,
  )

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: parsed.enabled ? 'migration.dual_capture.enabled' : 'migration.dual_capture.disabled',
    resourceKind: 'system_config',
    resourceId: 'webhook_dual_capture',
    reason: parsed.reason,
    before: before as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
    ip: built.data.ip,
    userAgent: built.data.userAgent,
  })

  await built.data.flushAfterCommit()
  return NextResponse.json({ ok: true, config: updated })
}
