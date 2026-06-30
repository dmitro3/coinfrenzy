import { redemption } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/07 §10.1 — annual 1099-MISC rollup. Runs January 15 at 09:00 UTC.
// Computes prior calendar year totals for any player whose `paid`
// redemptions summed ≥ $600, then inserts pending tax_reports rows for
// the Master admin to act on (form generation + delivery is manual in v1).

export const annualTaxRollup = inngest.createFunction(
  { id: 'annual-tax-rollup', retries: 3 },
  { cron: '0 9 15 1 *' },
  async ({ step }) => {
    return await step.run('generate', async () => {
      const { ctx, flushAfterCommit } = buildWorkerContext({
        loggerBindings: { job: 'annual-tax-rollup' },
      })
      const result = await redemption.generateAnnualTaxRollup(ctx)
      await flushAfterCommit()
      if (!result.ok) {
        ctx.logger.error('tax_rollup_failed', { error: result.error })
        throw new Error('tax_rollup_failed')
      }
      ctx.logger.info('tax_rollup_done', { ...result.value })
      return result.value
    })
  },
)
