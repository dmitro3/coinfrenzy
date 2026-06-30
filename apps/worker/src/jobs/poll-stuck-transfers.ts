import { sql } from 'drizzle-orm'

import { adapters, webhooks } from '@coinfrenzy/core'
import { schema } from '@coinfrenzy/db'
import { isMockEnabled } from '@coinfrenzy/config'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/05 §9.5 — poll Finix for any pending purchase older than 10 min.
// If Finix reports SUCCEEDED/FAILED, synthesize the corresponding
// pending_webhooks row and fire the handler so the ledger settles.

export const pollStuckTransfers = inngest.createFunction(
  { id: 'poll-stuck-transfers', concurrency: { limit: 1 } },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    if (isMockEnabled('finix')) {
      // Mock fires the webhook on a 2s timer; the poller is a no-op until
      // the operator flips USE_MOCK_FINIX=false.
      return { skipped: 'mock_mode' }
    }

    const { ctx } = buildWorkerContext({ loggerBindings: { job: 'poll-stuck-transfers' } })
    const stuck = await ctx.db
      .select({
        id: schema.purchases.id,
        finixTransferId: schema.purchases.finixTransferId,
      })
      .from(schema.purchases)
      .where(
        sql`${schema.purchases.status} = 'pending' AND ${schema.purchases.createdAt} < now() - interval '10 minutes'`,
      )
      .limit(50)

    const finix = adapters.finix.getFinixClient()
    let recovered = 0

    for (const row of stuck) {
      if (!row.finixTransferId) continue
      try {
        await step.run(`recover-${row.id}`, async () => {
          const remote = await finix.getTransfer(row.finixTransferId!)
          if (remote.state !== 'SUCCEEDED' && remote.state !== 'FAILED') return

          // Synthesize a webhook payload and route it through the handler
          // tree directly — we don't need to re-verify since this is our
          // own server-driven recovery path.
          const handlers = webhooks.finix.buildFinixHandlers(ctx)
          const event = {
            id: `recovered_${row.finixTransferId}`,
            type: remote.state === 'SUCCEEDED' ? 'transfer.succeeded' : 'transfer.failed',
            entity: {
              id: remote.transferId,
              amount: Number(remote.amountCents),
              state: remote.state,
              tags: remote.tags,
              network_details: { threeds_result: remote.threedsResult },
              address_verification: remote.avsResult,
              security_code_verification: remote.cvvResult,
              payment_instrument: {
                last_four: remote.cardLast4,
                brand: remote.cardBrand,
              },
              failure_code: remote.failureCode,
              failure_message: remote.failureMessage,
            },
          }
          const handler = handlers[event.type]
          if (!handler) return
          await handler(event, { rawBody: JSON.stringify(event) })
          recovered++
        })
      } catch (e) {
        ctx.logger.error('poll_stuck_transfer_failed', {
          purchaseId: row.id,
          transferId: row.finixTransferId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    return { stuck: stuck.length, recovered }
  },
)
