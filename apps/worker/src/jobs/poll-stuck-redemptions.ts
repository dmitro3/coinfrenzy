import { sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import { adapters } from '@coinfrenzy/core'
import { isMockEnabled } from '@coinfrenzy/config'

import { dispatchPolledFinixPayout } from '../lib/finix-payout-poll'
import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/05 §9.5 + docs/07 §8.1 — recover Finix payouts that never produced
// a webhook. Every 5 minutes, scan redemptions stuck in `awaiting_webhook`
// for >10 minutes and ask Finix directly. If the transfer SUCCEEDED or
// FAILED, fire the same handler the live webhook would have invoked.
//
// In mock mode the Finix store is per-process — there's no real network
// to lose, so we skip the call to keep the test environment quiet.

export const pollStuckRedemptions = inngest.createFunction(
  { id: 'poll-stuck-redemptions' },
  { cron: '*/5 * * * *' },
  async () => {
    if (isMockEnabled('finix')) return { skipped: 'mock_mode' }

    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'poll-stuck-redemptions' },
    })

    const stuck = await ctx.db
      .select({
        id: schema.redemptions.id,
        finixTransferId: schema.redemptions.finixTransferId,
      })
      .from(schema.redemptions)
      .where(
        sql`${schema.redemptions.status} = 'awaiting_webhook'
          AND ${schema.redemptions.submittedToFinixAt} < now() - interval '10 minutes'
          AND ${schema.redemptions.finixTransferId} IS NOT NULL`,
      )
      .limit(50)

    if (stuck.length === 0) return { stuck: 0, recovered: 0 }

    const client = adapters.finix.getFinixClient()
    let recovered = 0
    for (const row of stuck) {
      if (!row.finixTransferId) continue
      try {
        const transfer = await client.getTransfer(row.finixTransferId)
        if (transfer.state === 'SUCCEEDED' || transfer.state === 'FAILED') {
          await dispatchPolledFinixPayout(ctx, {
            redemptionId: row.id,
            transfer,
          })
          recovered += 1
        }
      } catch (e) {
        ctx.logger.warn('redemption_poll_failed', {
          redemptionId: row.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    await flushAfterCommit()

    if (stuck.length > recovered) {
      ctx.logger.warn('redemptions_awaiting_webhook_overdue', {
        outstanding: stuck.length - recovered,
      })
    }
    return { stuck: stuck.length, recovered }
  },
)
