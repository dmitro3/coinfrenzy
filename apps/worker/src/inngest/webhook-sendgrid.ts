import { webhooks } from '@coinfrenzy/core'

import { buildWorkerContext } from '../lib/context'

import { inngest } from './client'

export const processSendGridWebhook = inngest.createFunction(
  {
    id: 'process-sendgrid-webhook',
    concurrency: { limit: 50 },
    retries: 3,
  },
  { event: 'webhook/sendgrid.received' },
  async ({ event, step }) => {
    const { pendingWebhookId } = event.data as { pendingWebhookId: string }
    await step.run('dispatch', async () => {
      const { ctx } = buildWorkerContext({ loggerBindings: { worker: 'sendgrid' } })
      const handlers = webhooks.sendgrid.buildSendGridHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'sendgrid',
        pendingWebhookId,
        handlers,
      })
    })
    return { dispatched: true }
  },
)
