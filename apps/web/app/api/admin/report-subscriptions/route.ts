import { NextResponse, type NextRequest } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, reports } from '@coinfrenzy/core'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/12 §10 — list/create scheduled report subscriptions.

const createSchema = z.object({
  reportKind: z.enum([
    'daily_summary',
    'weekly_summary',
    'monthly_summary',
    'custom_query',
    'affiliate_payout_due',
  ]),
  schedule: z.string().min(1).max(120),
  emailTo: z.array(z.string().email()).min(1),
  emailSubject: z.string().max(200).optional().nullable(),
  querySpec: z.unknown().optional(),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const rows = await built.data.ctx.db
    .select()
    .from(schema.reportSubscriptions)
    .where(eq(schema.reportSubscriptions.adminId, built.data.session.admin.id))
    .orderBy(desc(schema.reportSubscriptions.createdAt))

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      reportKind: r.reportKind,
      schedule: r.schedule,
      emailTo: r.emailTo,
      emailSubject: r.emailSubject,
      enabled: r.enabled,
      lastSentAt: r.lastSentAt?.toISOString() ?? null,
      nextDueAt: r.nextDueAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
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

  const result = await reports.createReportSubscription(built.data.ctx.db, {
    adminId: built.data.session.admin.id,
    reportKind: body.reportKind,
    schedule: body.schedule,
    emailTo: body.emailTo,
    emailSubject: body.emailSubject ?? undefined,
    querySpec: body.querySpec,
  })

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: 'reports.subscription.create',
    resourceKind: 'report_subscription',
    resourceId: result.id,
    after: {
      reportKind: body.reportKind,
      schedule: body.schedule,
      emailTo: body.emailTo,
    },
    requestId: built.data.ctx.reqId,
  })

  return NextResponse.json({ id: result.id })
}
