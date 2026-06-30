import { webhooks } from '@coinfrenzy/core'

import { buildWorkerContext } from '../lib/context'

import { inngest } from './client'

// docs/05 §2.2 — Inngest dispatcher for Finix webhooks. The web app pushes
// a `webhook/finix.received` event after persisting to pending_webhooks;
// this function picks it up, marks the row processing, dispatches by
// event type, and marks completed.

export const processFinixWebhook = inngest.createFunction(
  {
    id: 'process-finix-webhook',
    concurrency: { limit: 100 },
    retries: 5,
  },
  { event: 'webhook/finix.received' },
  async ({ event, step }) => {
    const { pendingWebhookId } = event.data as { pendingWebhookId: string }
    await step.run('dispatch', async () => {
      const { ctx } = buildWorkerContext({ loggerBindings: { worker: 'finix' } })
      const handlers = webhooks.finix.buildFinixHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'finix',
        pendingWebhookId,
        handlers,
      })
    })
    return { dispatched: true }
  },
)
