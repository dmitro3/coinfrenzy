import { games as coreGames } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/04 §7.2 — Nightly Alea round reconciliation.
//
// Runs daily at 04:30 UTC (after the wallet reconcile at 04:00, before
// morning reports). Pulls the prior 24h of rounds from Alea, diffs
// against game_rounds, and writes findings to
// alea_reconciliation_findings. Critical findings (missing on Alea,
// amount/currency mismatch) are logged at error severity so the alerting
// pipeline (Sentry → PagerDuty) pages on-call.

const CRON_NIGHTLY_UTC = '30 4 * * *'

export const reconcileAleaNightly = inngest.createFunction(
  { id: 'reconcile-alea-nightly', name: 'Nightly Alea round reconciliation' },
  { cron: CRON_NIGHTLY_UTC },
  async ({ step }) => {
    return step.run('reconcile-alea', async () => {
      const { ctx, flushAfterCommit } = buildWorkerContext({
        loggerBindings: { job: 'reconcile-alea-nightly' },
      })
      try {
        // D-1 window: yesterday 00:00 UTC → today 00:00 UTC.
        const to = new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
        )
        const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)

        const result = await coreGames.reconcileAleaRounds({
          ctx,
          from,
          to,
        })

        if (result.critical > 0) {
          ctx.logger.error('alea reconciliation found critical discrepancies', { ...result })
        } else if (result.missingFromOurs > 0) {
          ctx.logger.warn('alea reconciliation found missing local rounds', { ...result })
        } else {
          ctx.logger.info('alea reconciliation clean', { ...result })
        }
        return result
      } finally {
        await flushAfterCommit()
      }
    })
  },
)
