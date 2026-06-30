import { ledger } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/04 §7.1 — nightly wallet reconciliation. Runs at 04:00 UTC daily so
// it doesn't collide with the 03:00 daily-snapshot job that lands later.
// Window: 30 days, which leverages monthly partition pruning per the doc.
//
// Drift threshold: 0.0001 (handled inside core/ledger.reconcileWallets).
// On drift -> PagerDuty SEV-1 per docs/04 §9.4. The PagerDuty wiring lives
// in apps/worker/src/lib/alerts.ts (deferred to the observability prompt).

const CRON_NIGHTLY_UTC = '0 4 * * *'

export const reconcileWalletsNightly = inngest.createFunction(
  { id: 'reconcile-wallets-nightly', name: 'Nightly wallet reconciliation (30d window)' },
  { cron: CRON_NIGHTLY_UTC },
  async ({ step }) => {
    return step.run('reconcile-30d', async () => {
      const { ctx, flushAfterCommit } = buildWorkerContext({
        loggerBindings: { job: 'reconcile-wallets-nightly' },
      })
      const result = await ledger.reconcileWallets(ctx, { windowDays: 30 })
      await flushAfterCommit()

      if (!result.ok) {
        ctx.logger.error('reconcileWallets failed', { error: result.error })
        // TODO(prompt 11): page PagerDuty SEV-1.
        throw new Error(`reconcileWallets error: ${result.error.code}`)
      }

      const summary = {
        status: result.value.status,
        windowDays: result.value.windowDays,
        driftRowCount: result.value.rows.length,
      }
      ctx.logger.info('reconcile-wallets-nightly completed', summary)

      if (result.value.status === 'drift_detected') {
        // TODO(prompt 11): page PagerDuty with the drift details.
        ctx.logger.error('wallet ledger drift detected — page SEV-1', {
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
