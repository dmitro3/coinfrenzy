import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'

import { hasAtLeast } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/13 — single run detail. Returns the run row + per-table summaries
// + a sample of row errors + open review-queue items for that run.

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  const runRows = await built.data.ctx.db
    .select()
    .from(schema.migrationRuns)
    .where(eq(schema.migrationRuns.id, id))
    .limit(1)
  const run = runRows[0]
  if (!run) return jsonError(404, 'not_found')

  const tables = await built.data.ctx.db
    .select()
    .from(schema.migrationImports)
    .where(eq(schema.migrationImports.runId, id))

  const errorRows = await built.data.ctx.db
    .select()
    .from(schema.migrationRowErrors)
    .where(eq(schema.migrationRowErrors.runId, id))
    .orderBy(desc(schema.migrationRowErrors.createdAt))
    .limit(50)

  const reviews = await built.data.ctx.db
    .select()
    .from(schema.migrationReviewQueue)
    .where(eq(schema.migrationReviewQueue.runId, id))
    .orderBy(desc(schema.migrationReviewQueue.createdAt))
    .limit(50)

  return NextResponse.json({ run, tables, errorRows, reviews })
}
