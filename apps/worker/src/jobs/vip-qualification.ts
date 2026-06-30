import { vip as vipModule } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// M4 — nightly VIP qualification pass.
//
// At 02:00 UTC every night, recompute `players.vip_status` against the
// current `player_lifetime_stats.total_deposited_usd`. Auto-promotes (never
// auto-demotes); writes audit_log per upgrade via the core module.

export const vipQualificationNightly = inngest.createFunction(
  { id: 'vip-qualification-nightly' },
  { cron: '0 2 * * *' }, // 02:00 UTC every day
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'vip-qualification-nightly' },
    })

    const result = await step.run('evaluate', async () => {
      const { upgradeCount, newlyQualifiedIds } = await vipModule.evaluateAllPlayers(ctx.db)
      ctx.logger.info('vip qualification done', {
        upgrade_count: upgradeCount,
        newly_qualified: newlyQualifiedIds.length,
      })
      return { upgradeCount, newlyQualifiedCount: newlyQualifiedIds.length }
    })

    await flushAfterCommit()
    return result
  },
)
