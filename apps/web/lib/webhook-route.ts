import 'server-only'

import { NextResponse } from 'next/server'

import { webhooks } from '@coinfrenzy/core'
import type { Vendor } from '@coinfrenzy/config'
import { isMockEnabled } from '@coinfrenzy/config'

import { sendInngestEvent } from './inngest-client'
import { buildWebhookContext } from './webhook-context'

// docs/05 §2 — every per-vendor webhook route reduces to:
//
//   const adapter = makeAdapter()
//   return handleWebhookRoute({ provider, request, adapter })
//
// The shared helper handles the 8-step pattern (verify → idempotency →
// persist → dispatch → ack) and dispatches to Inngest. In mock mode, when
// the runtime supports same-process inline processing, we ALSO loopback
// the handlers immediately so tests don't need an Inngest dev server.

export interface HandleWebhookRouteInput {
  provider: Vendor
  request: Request
  adapter: webhooks.ProviderAdapter
  /**
   * Same-process inline processing path. Only used in mock mode when the
   * caller wants the ledger to update before the response returns. The
   * worker still subscribes to the Inngest event in real mode.
   */
  inlineProcess?: (input: { pendingWebhookId: string; rawBody: string }) => Promise<void>
}

export async function handleWebhookRoute(input: HandleWebhookRouteInput): Promise<Response> {
  const { ctx, flushAfterCommit } = buildWebhookContext(input.provider)
  const outcome = await webhooks.receiveWebhook({
    ctx,
    provider: input.provider,
    request: input.request,
    adapter: input.adapter,
    inngestSend: sendInngestEvent,
    onAfterPersist:
      isMockEnabled(input.provider) && input.inlineProcess
        ? async ({ pendingWebhookId, rawBody }) => {
            try {
              await input.inlineProcess?.({ pendingWebhookId, rawBody })
            } catch (e) {
              ctx.logger.warn('inline_process_failed', {
                provider: input.provider,
                error: e instanceof Error ? e.message : String(e),
              })
            }
          }
        : undefined,
  })

  await flushAfterCommit()

  if (outcome.body === 'OK') {
    return new NextResponse('OK', { status: outcome.status })
  }
  return new NextResponse(outcome.body, {
    status: outcome.status,
    headers: { 'content-type': 'application/json' },
  })
}
