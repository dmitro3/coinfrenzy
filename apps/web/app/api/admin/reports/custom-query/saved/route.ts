import { NextResponse, type NextRequest } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §15 + docs/12 §6.8 — saved custom-query definitions. Master only.
// CRUD for `custom_query_definitions`.

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  queryConfig: z.unknown(),
  schedule: z.string().max(120).optional().nullable(),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (built.data.session.payload.role !== 'master') {
    return NextResponse.json({ error: 'forbidden_master_only' }, { status: 403 })
  }

  const rows = await built.data.ctx.db
    .select()
    .from(schema.customQueryDefinitions)
    .orderBy(desc(schema.customQueryDefinitions.createdAt))
    .limit(200)

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      queryConfig: r.queryConfig,
      schedule: r.schedule,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (built.data.session.payload.role !== 'master') {
    return NextResponse.json({ error: 'forbidden_master_only' }, { status: 403 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const [row] = await built.data.ctx.db
    .insert(schema.customQueryDefinitions)
    .values({
      adminId: built.data.session.admin.id,
      name: body.name,
      description: body.description ?? null,
      queryConfig: body.queryConfig as object,
      schedule: body.schedule ?? null,
    })
    .returning({ id: schema.customQueryDefinitions.id })

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: 'reports.custom_query.save',
    resourceKind: 'custom_query_definition',
    resourceId: row?.id ?? null,
    after: { name: body.name, schedule: body.schedule ?? null },
    requestId: built.data.ctx.reqId,
  })

  return NextResponse.json({ id: row?.id ?? null })
}

export async function DELETE(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (built.data.session.payload.role !== 'master') {
    return NextResponse.json({ error: 'forbidden_master_only' }, { status: 403 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  await built.data.ctx.db
    .delete(schema.customQueryDefinitions)
    .where(eq(schema.customQueryDefinitions.id, id))

  await audit.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: built.data.session.admin.id,
    actorRole: built.data.session.payload.role,
    action: 'reports.custom_query.delete',
    resourceKind: 'custom_query_definition',
    resourceId: id,
    requestId: built.data.ctx.reqId,
  })

  return NextResponse.json({ ok: true })
}
