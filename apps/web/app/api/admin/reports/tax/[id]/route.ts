import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §10 — 1099-MISC review queue actions. Master-only.
//
// Transitions:
//   pending_generation -> generated      (action: generate)
//   generated          -> delivered      (action: deliver)
//   delivered          -> filed          (action: file)
//   any non-final      -> cancelled      (action: cancel)
//
// Form generation itself is stubbed for v1 — we record `generated_at`
// and rely on the IRS-side service (Track1099 / TaxBandits) to be wired
// in v2. The audit row carries the actor, the action, and the row id.

const bodySchema = z.object({
  action: z.enum(['generate', 'deliver', 'file', 'cancel']),
  method: z.enum(['email', 'mail']).optional(),
  reason: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { session, ip, userAgent } = built.data

  if (session.payload.role !== 'master') {
    return jsonError(403, 'master_required')
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return jsonError(400, 'invalid_input', parsed.error.flatten())

  const db = getDb()
  const [row] = await db
    .select()
    .from(schema.taxReports)
    .where(eq(schema.taxReports.id, id))
    .limit(1)
  if (!row) return jsonError(404, 'not_found')

  let nextStatus: string | null = null
  const patch: Partial<typeof schema.taxReports.$inferInsert> = {}
  const now = new Date()

  switch (parsed.data.action) {
    case 'generate':
      if (row.status !== 'pending_generation') {
        return jsonError(409, `cannot_generate_in_state_${row.status}`)
      }
      nextStatus = 'generated'
      patch.generatedAt = now
      break
    case 'deliver':
      if (row.status !== 'generated') {
        return jsonError(409, `cannot_deliver_in_state_${row.status}`)
      }
      nextStatus = 'delivered'
      patch.deliveredAt = now
      patch.deliveryMethod = parsed.data.method ?? 'email'
      break
    case 'file':
      if (row.status !== 'delivered') {
        return jsonError(409, `cannot_file_in_state_${row.status}`)
      }
      nextStatus = 'filed'
      patch.filedAt = now
      break
    case 'cancel':
      if (row.status === 'filed' || row.status === 'cancelled') {
        return jsonError(409, `cannot_cancel_in_state_${row.status}`)
      }
      nextStatus = 'cancelled'
      break
  }

  await db
    .update(schema.taxReports)
    .set({ status: nextStatus!, ...patch })
    .where(eq(schema.taxReports.id, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: `tax_report.${parsed.data.action}`,
    resourceKind: 'tax_report',
    resourceId: id,
    before: { status: row.status },
    after: { status: nextStatus, ...patch },
    reason: parsed.data.reason ?? null,
    ip,
    userAgent,
  })

  return NextResponse.json({ ok: true, status: nextStatus })
}
