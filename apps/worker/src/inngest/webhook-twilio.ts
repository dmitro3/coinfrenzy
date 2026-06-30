import { webhooks } from '@coinfrenzy/core'

import { buildWorkerContext } from '../lib/context'

import { inngest } from './client'

export const processTwilioWebhook = inngest.createFunction(
  {
    id: 'process-twilio-webhook',
    concurrency: { limit: 30 },
    retries: 3,
  },
  { event: 'webhook/twilio.received' },
  async ({ event, step }) => {
    const { pendingWebhookId } = event.data as { pendingWebhookId: string }
    await step.run('dispatch', async () => {
      const { ctx } = buildWorkerContext({ loggerBindings: { worker: 'twilio' } })
      const handlers = webhooks.twilio.buildTwilioHandlers(ctx)
      await webhooks.dispatchPendingWebhook({
        db: ctx.db,
        provider: 'twilio',
        pendingWebhookId,
        handlers,
      })
    })
    return { dispatched: true }
  },
)
