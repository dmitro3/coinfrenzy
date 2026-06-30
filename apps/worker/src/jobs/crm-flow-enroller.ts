import { crm } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/11 §5.2 — recovery enroller. Every minute we re-scan
// player_events written in the last 5 minutes for any event matching an
// active flow's trigger event whose player isn't already enrolled. This
// is belt-and-braces over the live Inngest event stream from
// `events.emit()` — if Inngest had a hiccup, we still enroll.

export const crmFlowEnroller = inngest.createFunction(
  { id: 'crm-flow-enroller' },
  { cron: '* * * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'crm-flow-enroller' },
    })

    const result = await step.run('recover', async () => {
      const since = new Date(Date.now() - 5 * 60 * 1000)
      return crm.recoveryEnrollScan(ctx, since)
    })

    await flushAfterCommit()
    return result
  },
)
