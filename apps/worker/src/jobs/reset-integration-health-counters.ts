import { webhooks } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/05 §8 — without this cron the integration_health table's `*_count_1h`
// columns are not 1h counters at all; they accumulate forever and the tile
// labels lie. We roll the window at :05 every hour so the values match what
// the Integrity page advertises.
export const resetIntegrationHealthCounters = inngest.createFunction(
  { id: 'reset-integration-health-counters' },
  { cron: '5 * * * *' }, // every hour at :05
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'reset-integration-health-counters' },
    })

    await step.run('reset', async () => {
      await webhooks.resetHourlyCounters(ctx.db)
    })

    await flushAfterCommit()
    return { ok: true }
  },
)
