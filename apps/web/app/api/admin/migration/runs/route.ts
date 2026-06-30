import { NextResponse, type NextRequest } from 'next/server'
import { desc } from 'drizzle-orm'
import { z } from 'zod'

import { hasAtLeast } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'
import { sendInngestEvent } from '@/lib/inngest-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/13 §3-§5 — migration_runs list + enqueue.
//
// Listing is master-only because the migration surface is risky enough
// we don't want any sub-role exploring it. Enqueuing is also master-only
// and triggers an Inngest event the worker picks up. The HTTP layer never
// blocks the request waiting for the import to finish.

const postBody = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  mode: z.enum(['dry_run', 'production']),
  notes: z.string().max(500).optional(),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  const rows = await built.data.ctx.db
    .select({
      id: schema.migrationRuns.id,
      snapshotDate: schema.migrationRuns.snapshotDate,
      snapshotUri: schema.migrationRuns.snapshotUri,
      mode: schema.migrationRuns.mode,
      status: schema.migrationRuns.status,
      tablesTotal: schema.migrationRuns.tablesTotal,
      tablesSucceeded: schema.migrationRuns.tablesSucceeded,
      tablesFailed: schema.migrationRuns.tablesFailed,
      rowsImported: schema.migrationRuns.rowsImported,
      rowsFailed: schema.migrationRuns.rowsFailed,
      validationStatus: schema.migrationRuns.validationStatus,
      triggeredAt: schema.migrationRuns.triggeredAt,
      completedAt: schema.migrationRuns.completedAt,
      errorSummary: schema.migrationRuns.errorSummary,
    })
    .from(schema.migrationRuns)
    .orderBy(desc(schema.migrationRuns.triggeredAt))
    .limit(100)

  return NextResponse.json({ runs: rows })
}

export async function POST(req: NextRequest) {
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

  // Refuse production mode unless an explicit confirm token matches today's date.
  // (Soft guardrail — a real master could of course craft the request, but it
  // prevents accidental dry-run vs prod button mix-ups in the UI.)
  if (parsed.mode === 'production') {
    const today = new Date().toISOString().slice(0, 10)
    if (parsed.snapshotDate !== today) {
      return jsonError(400, 'production_requires_same_day_snapshot', {
        expected: today,
        provided: parsed.snapshotDate,
      })
    }
  }

  const inserted = await built.data.ctx.db
    .insert(schema.migrationRuns)
    .values({
      snapshotDate: parsed.snapshotDate,
      snapshotUri: `gamma-snapshots/${parsed.snapshotDate}`,
      mode: parsed.mode,
      status: 'queued',
      triggeredBy: built.data.session.admin.id,
      notes: parsed.notes,
    })
    .returning({ id: schema.migrationRuns.id })

  const runId = inserted[0].id
  try {
    await sendInngestEvent({ name: 'migration.run.start', data: { runId } })
  } catch (e) {
    // Leave the row in 'queued' so an operator can retry from the UI.
    built.data.ctx.logger.warn('failed_to_enqueue_migration', {
      runId,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  return NextResponse.json({ ok: true, runId, status: 'queued' })
}
