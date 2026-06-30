import { webhooks } from '@coinfrenzy/core'

import { buildWorkerContext } from '../lib/context'

import { inngest } from './client'

export const processFootprintWebhook = inngest.createFunction(
  {
    id: 'process-footprint-webhook',
    concurrency: { limit: 50 },
    retries: 5,
  },
  { event: 'webhook/footprint.received' },
  async ({ event, step }) => {
    const { pendingWebhookId } = event.data as { pendingWebhookId: string }
    await step.run('dispatch', async () => {
      const { ctx } = buildWorkerContext({ loggerBindings: { worker: 'footprint' } })
      const handlers = webhooks.footprint.buildFootprintHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'footprint',
        pendingWebhookId,
        handlers,
      })
    })
    return { dispatched: true }
  },
)
