import { webhooks } from '@coinfrenzy/core'

import { buildWorkerContext } from '../lib/context'

import { inngest } from './client'

export const processAleaWebhook = inngest.createFunction(
  {
    id: 'process-alea-webhook',
    concurrency: { limit: 200 },
    retries: 5,
  },
  { event: 'webhook/alea.received' },
  async ({ event, step }) => {
    const { pendingWebhookId } = event.data as { pendingWebhookId: string }
    await step.run('dispatch', async () => {
      const { ctx } = buildWorkerContext({ loggerBindings: { worker: 'alea' } })
      const handlers = webhooks.alea.buildAleaHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'alea',
        pendingWebhookId,
        handlers,
      })
    })
    return { dispatched: true }
  },
)
