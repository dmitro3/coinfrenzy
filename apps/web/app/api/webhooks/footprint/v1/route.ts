import 'server-only'

import { type NextRequest } from 'next/server'

import { adapters, webhooks } from '@coinfrenzy/core'

import { handleWebhookRoute } from '@/lib/webhook-route'
import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §4 — Footprint webhook (via Svix).

export async function POST(req: NextRequest): Promise<Response> {
  const adapter: webhooks.ProviderAdapter = {
    verifyWebhook: (raw, headers) => adapters.footprint.verifyFootprintWebhook(raw, headers),
    extractIdempotencyKey: (raw, headers) =>
      adapters.footprint.extractFootprintIdempotencyKey(raw, headers),
    extractEventType: (raw) => adapters.footprint.extractFootprintEventType(raw),
  }

  return handleWebhookRoute({
    provider: 'footprint',
    request: req,
    adapter,
    inlineProcess: async ({ pendingWebhookId }) => {
      const { ctx } = buildWebhookContext('footprint')
      const handlers = webhooks.footprint.buildFootprintHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'footprint',
        pendingWebhookId,
        handlers,
      })
    },
  })
}
