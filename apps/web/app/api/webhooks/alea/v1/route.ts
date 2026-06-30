import 'server-only'

import { type NextRequest } from 'next/server'

import { adapters, webhooks } from '@coinfrenzy/core'

import { handleWebhookRoute } from '@/lib/webhook-route'
import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §5 — Alea round/session webhooks. The synchronous balance-query
// endpoint lives in a sibling route file.

export async function POST(req: NextRequest): Promise<Response> {
  const adapter: webhooks.ProviderAdapter = {
    verifyWebhook: (raw, headers) => adapters.alea.verifyAleaWebhook(raw, headers),
    extractIdempotencyKey: (raw) => adapters.alea.extractAleaIdempotencyKey(raw),
    extractEventType: (raw) => adapters.alea.extractAleaEventType(raw),
  }

  return handleWebhookRoute({
    provider: 'alea',
    request: req,
    adapter,
    inlineProcess: async ({ pendingWebhookId }) => {
      const { ctx } = buildWebhookContext('alea')
      const handlers = webhooks.alea.buildAleaHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'alea',
        pendingWebhookId,
        handlers,
      })
    },
  })
}
