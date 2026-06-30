import { crm } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/11 §5.3 — process all due flow enrollments. Runs every minute.
// Per-enrollment errors are caught inside processDueEnrollments so a
// single bad config can't stall the loop.

export const crmFlowRunner = inngest.createFunction(
  { id: 'crm-flow-runner' },
  { cron: '* * * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'crm-flow-runner' },
    })

    const result = await step.run('process', async () =>
      crm.processDueEnrollments(ctx, { batchSize: 1000 }),
    )

    await flushAfterCommit()
    return result
  },
)
