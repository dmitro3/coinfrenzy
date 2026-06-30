import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { migration } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  const runRows = await built.data.ctx.db
    .select({
      id: schema.migrationRuns.id,
      snapshotDate: schema.migrationRuns.snapshotDate,
    })
    .from(schema.migrationRuns)
    .where(eq(schema.migrationRuns.id, id))
    .limit(1)
  if (!runRows[0]) return jsonError(404, 'not_found')

  const report = await migration.validateRun({
    ctx: built.data.ctx,
    snapshotDate: runRows[0].snapshotDate,
    runId: id,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true, report })
}
