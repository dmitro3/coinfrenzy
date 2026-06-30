import 'server-only'

import { type NextRequest } from 'next/server'

import { adapters, webhooks } from '@coinfrenzy/core'

import { handleWebhookRoute } from '@/lib/webhook-route'
import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §7.2 — Twilio inbound + outbound status webhook. The signature
// verifier needs the request URL to recompute the HMAC; we build the
// canonical URL from the request headers.

export async function POST(req: NextRequest): Promise<Response> {
  const fullUrl = new URL(req.url).toString()

  const adapter: webhooks.ProviderAdapter = {
    verifyWebhook: (raw, headers) =>
      adapters.twilio.verifyTwilioWebhook(raw, headers, { url: fullUrl }),
    extractIdempotencyKey: (raw) => adapters.twilio.extractTwilioIdempotencyKey(raw),
    extractEventType: (raw) => adapters.twilio.extractTwilioEventType(raw),
  }

  return handleWebhookRoute({
    provider: 'twilio',
    request: req,
    adapter,
    inlineProcess: async ({ pendingWebhookId }) => {
      const { ctx } = buildWebhookContext('twilio')
      const handlers = webhooks.twilio.buildTwilioHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'twilio',
        pendingWebhookId,
        handlers,
      })
    },
  })
}
