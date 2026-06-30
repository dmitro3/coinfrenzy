import 'server-only'

import { type NextRequest } from 'next/server'

import { adapters, webhooks } from '@coinfrenzy/core'

import { handleWebhookRoute } from '@/lib/webhook-route'
import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §7.1 — SendGrid event batch.

export async function POST(req: NextRequest): Promise<Response> {
  const adapter: webhooks.ProviderAdapter = {
    verifyWebhook: (raw, headers) => adapters.sendgrid.verifySendGridWebhook(raw, headers),
    extractIdempotencyKey: (raw) => adapters.sendgrid.extractSendGridIdempotencyKey(raw),
    extractEventType: () => adapters.sendgrid.extractSendGridEventType(),
  }

  return handleWebhookRoute({
    provider: 'sendgrid',
    request: req,
    adapter,
    inlineProcess: async ({ pendingWebhookId }) => {
      const { ctx } = buildWebhookContext('sendgrid')
      const handlers = webhooks.sendgrid.buildSendGridHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'sendgrid',
        pendingWebhookId,
        handlers,
      })
    },
  })
}
