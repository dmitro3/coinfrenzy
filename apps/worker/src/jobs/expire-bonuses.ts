import { bonus as bonusEngine } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/06 §9 — hourly bonus-expiry job. Walks `bonuses_awarded` for rows
// past their expires_at with playthrough still outstanding, claws back any
// remaining bonus SC, and marks the row as `expired`.

export const expireBonuses = inngest.createFunction(
  { id: 'expire-bonuses' },
  { cron: '0 * * * *' }, // every hour at :00
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'expire-bonuses' },
    })

    const result = await step.run('expire', async () => {
      const r = await bonusEngine.expireBonuses(ctx, { limit: 500 })
      return {
        processed: r.processed,
        clawedBackAwards: r.clawedBackAwards,
        totalClawbackSc: r.totalClawbackSc.toString(),
      }
    })

    await flushAfterCommit()
    return result
  },
)
