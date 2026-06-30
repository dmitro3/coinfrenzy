import { ledger } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/04 §7.1 — monthly full reconciliation over the ENTIRE ledger.
// Takes 30+ minutes at scale; runs on the 1st of every month at 05:00 UTC
// (after the nightly job has confirmed the recent 30-day window is clean).

const CRON_FIRST_OF_MONTH_UTC = '0 5 1 * *'

export const reconcileWalletsMonthly = inngest.createFunction(
  {
    id: 'reconcile-wallets-monthly',
    name: 'Monthly full wallet reconciliation (all-time)',
  },
  { cron: CRON_FIRST_OF_MONTH_UTC },
  async ({ step }) => {
    return step.run('reconcile-all-time', async () => {
      const { ctx, flushAfterCommit } = buildWorkerContext({
        loggerBindings: { job: 'reconcile-wallets-monthly' },
      })
      const result = await ledger.reconcileWalletsFull(ctx)
      await flushAfterCommit()

      if (!result.ok) {
        ctx.logger.error('reconcileWalletsFull failed', { error: result.error })
        throw new Error(`reconcileWalletsFull error: ${result.error.code}`)
      }

      const summary = {
        status: result.value.status,
        windowDays: 'all',
        driftRowCount: result.value.rows.length,
      }
      ctx.logger.info('reconcile-wallets-monthly completed', summary)

      if (result.value.status === 'drift_detected') {
        ctx.logger.error('full-history ledger drift detected — page SEV-1', {
          rows: result.value.rows.map((r) => ({
            walletId: r.walletId,
            playerId: r.playerId,
            currency: r.currency,
            walletBalance: r.walletBalance.toString(),
            ledgerBalance: r.ledgerBalance.toString(),
            drift: r.drift.toString(),
          })),
        })
      }
      return summary
    })
  },
)
