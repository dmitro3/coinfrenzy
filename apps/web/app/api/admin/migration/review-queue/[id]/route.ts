import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const postBody = z.object({
  action: z.enum(['apply', 'dismiss']),
  resolution: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(500).optional(),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof postBody>
  try {
    parsed = postBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const rows = await built.data.ctx.db
    .select()
    .from(schema.migrationReviewQueue)
    .where(eq(schema.migrationReviewQueue.id, id))
    .limit(1)
  if (!rows[0]) return jsonError(404, 'not_found')
  if (rows[0].status !== 'open') return jsonError(409, 'already_resolved')

  const nextStatus = parsed.action === 'apply' ? 'applied' : 'dismissed'

  await built.data.ctx.db
    .update(schema.migrationReviewQueue)
    .set({
      status: nextStatus,
      resolvedBy: built.data.session.admin.id,
      resolvedAt: new Date(),
      resolution: parsed.resolution ?? null,
      resolutionNotes: parsed.notes ?? null,
    })
    .where(eq(schema.migrationReviewQueue.id, id))

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: `migration.review.${nextStatus}`,
    resourceKind: 'migration_review',
    resourceId: id,
    reason: parsed.notes ?? null,
    before: { status: 'open' },
    after: { status: nextStatus, resolution: parsed.resolution ?? null },
    ip: built.data.ip,
    userAgent: built.data.userAgent,
    metadata: { kind: rows[0].kind },
  })

  await built.data.flushAfterCommit()
  return NextResponse.json({ ok: true, id, status: nextStatus })
}
