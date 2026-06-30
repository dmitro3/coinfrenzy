import { NextResponse, type NextRequest } from 'next/server'
import { desc } from 'drizzle-orm'
import { z } from 'zod'

import { audit, reports } from '@coinfrenzy/core'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext } from '@/lib/admin-route'
import { sendInngestEvent } from '@/lib/inngest-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/12 §7 — Export Center API.
// GET  /api/admin/exports  -> recent exports for the listing page
// POST /api/admin/exports  -> create a new export job (event → worker)

const createSchema = z.object({
  exportType: z.enum([
    'players',
    'purchases',
    'redemptions',
    'bonuses_awarded',
    'daily_kpis',
    'audit_log',
    'crm_message_log',
    'affiliates',
    'ledger_entries',
    'game_rounds',
    'wallets_snapshot',
    'promo_redemptions',
    'kyc_status',
    'tier_history',
    'custom',
  ]),
  filter: z
    .object({
      fromDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      toDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      extra: z.record(z.unknown()).optional(),
    })
    .optional(),
  customSpec: z.unknown().optional(),
  reason: z.string().max(500).optional().nullable(),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const rows = await built.data.ctx.db
    .select()
    .from(schema.dataExports)
    .orderBy(desc(schema.dataExports.createdAt))
    .limit(200)

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      exportType: r.exportType,
      status: r.status,
      rowCount: r.rowCount,
      sizeBytes: r.sizeBytes != null ? r.sizeBytes.toString() : null,
      downloadUrl: r.downloadUrl,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      requiresReview: r.requiresReview,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  // Custom exports without a master role aren't allowed.
  if (body.exportType === 'custom' && built.data.session.payload.role !== 'master') {
    return NextResponse.json({ error: 'forbidden_master_only' }, { status: 403 })
  }

  const create = await reports.createExportRequest(built.data.ctx.db, {
    adminId: built.data.session.admin.id,
    exportType: body.exportType,
    filter: body.filter,
    customSpec: body.customSpec,
    reason: body.reason ?? undefined,
    requiresReview: false,
  })

  if (!create.ok) {
    return NextResponse.json({ error: create.error.code }, { status: 400 })
  }

  await sendInngestEvent({
    name: 'reports/generate-export',
    data: { exportId: create.value.id },
  })

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: 'reports.export.create',
    resourceKind: 'export',
    resourceId: create.value.id,
    after: { exportType: body.exportType, filter: body.filter ?? null },
    requestId: built.data.ctx.reqId,
  })

  return NextResponse.json({ id: create.value.id, status: create.value.status })
}
