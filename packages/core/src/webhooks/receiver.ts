import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { type DbExecutor, schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { writeAuditEntry } from '../audit/index'
import { shouldSuppressDispatch } from '../migration/dual-capture'
import { markIntegrationHealth } from './integration-health'
import type { ProviderAdapter, VerifyResult, WebhookProvider } from './types'

/**
 * Defensive wrapper around the dual-capture check. The receiver MUST
 * NEVER throw because of a transient system_config read failure (that
 * would translate into a webhook timeout to the vendor). If the lookup
 * fails we log and proceed with normal dispatch.
 */
async function shouldSuppressDispatchSafe(
  ctx: Context,
  provider: WebhookProvider,
): Promise<boolean> {
  try {
    return await shouldSuppressDispatch(ctx.db, provider)
  } catch (e) {
    ctx.logger.warn('dual_capture_lookup_failed', {
      provider,
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

// docs/05 §2 — the universal webhook receiver pattern. Step-by-step:
//   1. Read raw body BEFORE any parsing (signatures sign raw bytes).
//   2. Verify signature.
//   3. Extract a vendor-stable idempotency key.
//   4. Receiver-level idempotency check via pending_webhooks.
//   5. Persist the raw event before processing.
//   6. Dispatch to Inngest for async processing.
//   7. Update integration_health.
//   8. Acknowledge to the provider.
//
// The 8 steps are pulled into a single helper so every per-provider route
// handler in apps/web stays at ~30 lines.

export interface ReceiverInput {
  ctx: Context
  provider: WebhookProvider
  request: Request
  adapter: ProviderAdapter
  /**
   * Optional Inngest event dispatcher. When omitted (tests, mock-loopback)
   * we skip the send call and processing happens synchronously via the
   * `onAfterPersist` hook below.
   */
  inngestSend?: (event: { name: string; data: Record<string, unknown> }) => Promise<unknown>
  /**
   * Optional hook fired AFTER the pending_webhooks row is persisted. Used by
   * tests and the mock-vendor loopback so we can run the processor inline
   * without spinning up an Inngest dev server.
   */
  onAfterPersist?: (input: {
    pendingWebhookId: string
    eventType: string
    rawBody: string
  }) => Promise<void>
}

export interface ReceiverOutcome {
  status: 200 | 401 | 500
  body: string
  /** Set to true when we short-circuited at the receiver-idempotency check. */
  duplicate?: boolean
  pendingWebhookId?: string
  eventType?: string
  latencyMs: number
}

export async function receiveWebhook(input: ReceiverInput): Promise<ReceiverOutcome> {
  const { ctx, provider, request, adapter } = input
  const startedAt = Date.now()

  try {
    // Step 1 — read raw bytes
    const rawBody = await request.text()
    const headers = headersToObject(request.headers)

    // Step 2 — verify signature
    const verification: VerifyResult = await adapter.verifyWebhook(rawBody, headers)
    if (!verification.ok) {
      await writeAuditEntry(ctx.db, {
        actorKind: 'system',
        action: 'webhook.signature_failed',
        resourceKind: 'webhook',
        reason: verification.error,
        metadata: {
          provider,
          headers: redactSecrets(headers),
        },
      })
      await markIntegrationHealth(ctx.db, {
        provider,
        outcome: 'failure',
        latencyMs: Date.now() - startedAt,
        errorReason: `signature_invalid:${verification.error}`,
      })
      return {
        status: 401,
        body: JSON.stringify({ error: 'invalid_signature', reason: verification.error }),
        latencyMs: Date.now() - startedAt,
      }
    }

    // Step 3 — idempotency key
    const idempotencyKey = adapter.extractIdempotencyKey(rawBody, headers)
    const eventType = adapter.extractEventType(rawBody, headers)

    // Step 4 — receiver-level dedupe
    const existing = await ctx.db
      .select({ id: schema.pendingWebhooks.id })
      .from(schema.pendingWebhooks)
      .where(
        and(
          eq(schema.pendingWebhooks.provider, provider),
          eq(schema.pendingWebhooks.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)

    if (existing[0]) {
      await markIntegrationHealth(ctx.db, {
        provider,
        outcome: 'duplicate',
        latencyMs: Date.now() - startedAt,
      })
      return {
        status: 200,
        body: 'OK',
        duplicate: true,
        pendingWebhookId: existing[0].id,
        eventType,
        latencyMs: Date.now() - startedAt,
      }
    }

    // Step 5 — persist raw event
    const pendingWebhookId = randomUUID()
    await ctx.db.insert(schema.pendingWebhooks).values({
      id: pendingWebhookId,
      provider,
      idempotencyKey,
      eventType,
      rawBody,
      rawHeaders: headers,
      status: 'received',
    })

    // Step 5.5 — docs/13 §6.1 dual-capture mode. During the T-30
    // pre-cutover window the operator can flip a system_config flag
    // to capture but NOT dispatch webhooks. The migration replay tool
    // picks these up on cutover night.
    const suppress = await shouldSuppressDispatchSafe(ctx, provider)
    if (suppress) {
      await markIntegrationHealth(ctx.db, {
        provider,
        outcome: 'success',
        latencyMs: Date.now() - startedAt,
      })
      return {
        status: 200,
        body: 'OK',
        pendingWebhookId,
        eventType,
        latencyMs: Date.now() - startedAt,
      }
    }

    // Step 6 — dispatch to Inngest. Optional so tests can run inline.
    if (input.inngestSend) {
      try {
        await input.inngestSend({
          name: `webhook/${provider}.received`,
          data: { pendingWebhookId, idempotencyKey, eventType },
        })
      } catch (e) {
        ctx.logger.warn('inngest_send_failed', {
          provider,
          eventType,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (input.onAfterPersist) {
      await input.onAfterPersist({ pendingWebhookId, eventType, rawBody })
    }

    // Step 7 — update health on success receipt
    await markIntegrationHealth(ctx.db, {
      provider,
      outcome: 'success',
      latencyMs: Date.now() - startedAt,
    })

    // Step 8 — ack
    return {
      status: 200,
      body: 'OK',
      pendingWebhookId,
      eventType,
      latencyMs: Date.now() - startedAt,
    }
  } catch (e) {
    ctx.logger.error('webhook_unhandled_error', {
      provider,
      error: e instanceof Error ? e.message : String(e),
    })
    await markIntegrationHealth(ctx.db, {
      provider,
      outcome: 'failure',
      latencyMs: Date.now() - startedAt,
      errorReason: 'unhandled_error',
    })
    return {
      status: 500,
      body: JSON.stringify({ error: 'internal_error' }),
      latencyMs: Date.now() - startedAt,
    }
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

/** Mask anything that looks like a credential before audit-log persistence. */
function redactSecrets(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (/auth|token|cookie|key|secret/i.test(k)) {
      out[k] = '<redacted>'
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * Reads a pending_webhooks row and dispatches to the per-event-type handler.
 * Called by Inngest dispatcher functions and by tests for inline processing.
 */
export interface DispatchInput {
  db: DbExecutor
  provider: WebhookProvider
  pendingWebhookId: string
  handlers: Record<string, (payload: unknown, ctx: { rawBody: string }) => Promise<void>>
}

export async function dispatchPendingWebhook(input: DispatchInput): Promise<void> {
  const rows = await input.db
    .select()
    .from(schema.pendingWebhooks)
    .where(eq(schema.pendingWebhooks.id, input.pendingWebhookId))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new Error(`pending_webhooks row ${input.pendingWebhookId} not found`)
  }

  await input.db
    .update(schema.pendingWebhooks)
    .set({
      status: 'processing',
      processingAttempts: (row.processingAttempts ?? 0) + 1,
      lastAttemptAt: new Date(),
    })
    .where(eq(schema.pendingWebhooks.id, row.id))

  const handler = input.handlers[row.eventType]
  if (!handler) {
    await input.db
      .update(schema.pendingWebhooks)
      .set({
        status: 'completed',
        lastError: `unknown_event_type:${row.eventType}`,
        processedAt: new Date(),
      })
      .where(eq(schema.pendingWebhooks.id, row.id))
    return
  }

  try {
    // Most providers post JSON; Twilio posts form-urlencoded. Try JSON
    // first; on parse failure, pass the raw body through to the handler.
    let payload: unknown
    try {
      payload = JSON.parse(row.rawBody)
    } catch {
      payload = row.rawBody
    }
    await handler(payload, { rawBody: row.rawBody })

    await input.db
      .update(schema.pendingWebhooks)
      .set({ status: 'completed', processedAt: new Date(), lastError: null })
      .where(eq(schema.pendingWebhooks.id, row.id))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await input.db
      .update(schema.pendingWebhooks)
      .set({ status: 'failed', lastError: message })
      .where(eq(schema.pendingWebhooks.id, row.id))
    throw e
  }
}
