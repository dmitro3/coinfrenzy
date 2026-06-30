// docs/13 §6.2 + docs/05 §10 — replay tool for the T-30 capture window.
//
// During the 30-day window before cutover, the receiver is configured
// to capture webhooks (system_config.webhook_dual_capture.enabled=true)
// but NOT dispatch them to Inngest. They sit in pending_webhooks with
// status='received'. After the final import on cutover night, this tool:
//   1. Lists every captured webhook in the [from, to] window.
//   2. Builds the per-provider handler tree (same code path as live).
//   3. Dispatches each event through dispatchPendingWebhook.
//   4. Records the outcome in migration_replay_log.
//
// Idempotency: migration_replay_log has a UNIQUE on pending_webhook_id,
// so re-running the tool against the same window skips already-replayed
// events. The underlying handlers are themselves idempotent (ledger
// dedupes on (source, source_id), purchases dedupe on finix_transfer_id),
// so even if the unique constraint were absent we'd be safe.

import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { writeAuditEntry } from '../audit/index'
import { dispatchPendingWebhook } from '../webhooks/receiver'
import { buildFinixHandlers } from '../webhooks/finix/index'
import { buildFootprintHandlers } from '../webhooks/footprint/index'
import { buildAleaHandlers } from '../webhooks/alea/index'

import type { ReplayWebhookResult } from './types'

export interface ReplayInput {
  ctx: Context
  /** Optional run id to associate replays with. */
  runId?: string | null
  /** Inclusive lower bound on pending_webhooks.received_at. */
  from: Date
  /** Exclusive upper bound on pending_webhooks.received_at. */
  to: Date
  /** Restrict to specific providers. Defaults to all dual-captured providers. */
  providers?: ('finix' | 'alea' | 'footprint')[]
  /** Dry-run: list what would be replayed without dispatching. */
  dryRun?: boolean
}

export async function replayCapturedWebhooks(input: ReplayInput): Promise<ReplayWebhookResult> {
  const { ctx } = input
  const providers = input.providers ?? ['finix', 'alea', 'footprint']

  const candidates = await ctx.db
    .select({
      id: schema.pendingWebhooks.id,
      provider: schema.pendingWebhooks.provider,
      eventType: schema.pendingWebhooks.eventType,
      status: schema.pendingWebhooks.status,
      receivedAt: schema.pendingWebhooks.receivedAt,
    })
    .from(schema.pendingWebhooks)
    .where(
      and(
        gte(schema.pendingWebhooks.receivedAt, input.from),
        lt(schema.pendingWebhooks.receivedAt, input.to),
        inArray(schema.pendingWebhooks.provider, providers),
        eq(schema.pendingWebhooks.status, 'received'),
      ),
    )
    .orderBy(asc(schema.pendingWebhooks.receivedAt))

  const result: ReplayWebhookResult = {
    total: candidates.length,
    completed: 0,
    failed: 0,
    duplicate: 0,
    skipped: 0,
  }

  if (input.dryRun) {
    result.skipped = candidates.length
    return result
  }

  const handlerCache: Partial<
    Record<
      'finix' | 'alea' | 'footprint',
      Record<string, (payload: unknown, ctx2: { rawBody: string }) => Promise<void>>
    >
  > = {}

  function getHandlers(provider: 'finix' | 'alea' | 'footprint') {
    if (!handlerCache[provider]) {
      if (provider === 'finix') handlerCache.finix = buildFinixHandlers(ctx)
      if (provider === 'footprint') handlerCache.footprint = buildFootprintHandlers(ctx)
      if (provider === 'alea') handlerCache.alea = buildAleaHandlers(ctx)
    }
    return handlerCache[provider]!
  }

  for (const row of candidates) {
    const provider = row.provider as 'finix' | 'alea' | 'footprint'
    // Skip already-replayed
    const existing = await ctx.db
      .select({ id: schema.migrationReplayLog.id })
      .from(schema.migrationReplayLog)
      .where(eq(schema.migrationReplayLog.pendingWebhookId, row.id))
      .limit(1)
    if (existing[0]) {
      result.duplicate++
      continue
    }

    let outcome: 'completed' | 'failed' | 'duplicate' | 'skipped' = 'completed'
    let errorMessage: string | null = null
    try {
      const handlers = getHandlers(provider)
      await dispatchPendingWebhook({
        db: ctx.db,
        provider: provider as Parameters<typeof dispatchPendingWebhook>[0]['provider'],
        pendingWebhookId: row.id,
        handlers,
      })
      // Mark as replayed_for_migration so it doesn't accidentally re-fire
      // through the standard receiver if dual-capture is left on.
      await ctx.db
        .update(schema.pendingWebhooks)
        .set({ status: 'replayed_for_migration' })
        .where(eq(schema.pendingWebhooks.id, row.id))
      result.completed++
    } catch (e) {
      outcome = 'failed'
      errorMessage = e instanceof Error ? e.message : String(e)
      result.failed++
    }

    await ctx.db.insert(schema.migrationReplayLog).values({
      runId: input.runId ?? null,
      pendingWebhookId: row.id,
      provider: row.provider,
      eventType: row.eventType,
      receivedAt: row.receivedAt,
      outcome,
      error: errorMessage,
    })
  }

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    action: 'migration.replay.completed',
    resourceKind: 'migration_run',
    resourceId: input.runId ?? null,
    metadata: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      providers,
      ...result,
    },
  })

  return result
}
