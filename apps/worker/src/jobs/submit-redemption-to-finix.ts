import { redemption } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/07 §8 — submit an approved redemption to Finix.
//
// The web app dispatches `redemption/submit-to-finix` after the cashier
// approves (or auto-approval routes the request straight through). Inngest
// retries on transient failures; permanent failures cause the redemption
// to be auto-rejected by core (SC returns to the player wallet).

export const submitRedemptionToFinixJob = inngest.createFunction(
  {
    id: 'redemption-submit-to-finix',
    concurrency: { limit: 25 },
    retries: 5,
  },
  { event: 'redemption/submit-to-finix' },
  async ({ event, step }) => {
    const { redemptionId } = event.data as { redemptionId: string }
    return await step.run('submit', async () => {
      const { ctx, flushAfterCommit } = buildWorkerContext({
        loggerBindings: { job: 'submit-to-finix', redemptionId },
      })
      const result = await redemption.submitRedemptionToFinix(ctx, { redemptionId })
      await flushAfterCommit()
      if (!result.ok) {
        if (result.error.code === 'TRANSIENT') {
          // Inngest re-runs the function — throwing tells it to retry.
          throw new Error(`finix_submit_transient:${result.error.reason}`)
        }
        // PERMANENT, NOT_APPROVED, NOT_FOUND, INSTRUMENT_MISSING — terminal.
        ctx.logger.warn('redemption_submit_terminal', {
          redemptionId,
          code: result.error.code,
        })
        return { ok: false, code: result.error.code }
      }
      return { ok: true, status: result.value.status, transferId: result.value.finixTransferId }
    })
  },
)
