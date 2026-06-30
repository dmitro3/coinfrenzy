import 'server-only'

import { type NextRequest } from 'next/server'

import { adapters, webhooks } from '@coinfrenzy/core'

import { handleWebhookRoute } from '@/lib/webhook-route'
import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §3 — Finix v1 receiver. Verification + persistence happen in the
// shared helper. Mock-mode inline processing runs the dispatcher in the
// same request so the ledger reflects the purchase before we return 200.

export async function POST(req: NextRequest): Promise<Response> {
  const adapter: webhooks.ProviderAdapter = {
    verifyWebhook: (raw, headers) => adapters.finix.verifyFinixWebhook(raw, headers),
    extractIdempotencyKey: (raw) => adapters.finix.extractFinixIdempotencyKey(raw),
    extractEventType: (raw) => adapters.finix.extractFinixEventType(raw),
  }

  return handleWebhookRoute({
    provider: 'finix',
    request: req,
    adapter,
    inlineProcess: async ({ pendingWebhookId }) => {
      const { ctx } = buildWebhookContext('finix')
      const handlers = webhooks.finix.buildFinixHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'finix',
        pendingWebhookId,
        handlers,
      })
    },
  })
}
