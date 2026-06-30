import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { migration } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/13 §6.2 — replay captured webhooks. Master only. Idempotent at the
// migration_replay_log level (unique on pending_webhook_id) AND at the
// per-handler ledger/source-id level. Re-running with the same window is
// safe.

const postBody = z.object({
  /** ISO timestamp — inclusive lower bound on received_at. */
  from: z.string().datetime(),
  /** ISO timestamp — exclusive upper bound on received_at. */
  to: z.string().datetime(),
  runId: z.string().uuid().optional(),
  providers: z.array(z.enum(['finix', 'alea', 'footprint'])).optional(),
  dryRun: z.boolean().optional(),
})

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

  const from = new Date(parsed.from)
  const to = new Date(parsed.to)
  if (!(to > from)) {
    return jsonError(400, 'invalid_window', { reason: '"to" must be after "from"' })
  }

  const result = await migration.replayCapturedWebhooks({
    ctx: built.data.ctx,
    runId: parsed.runId ?? null,
    from,
    to,
    providers: parsed.providers,
    dryRun: parsed.dryRun ?? false,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true, result })
}
