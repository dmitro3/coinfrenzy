import { sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import { crm } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/11 §4.2 — campaign send pipeline. Every minute, pick up campaigns
// whose `scheduled_for <= NOW()` and status='scheduled', resolve segment,
// dispatch, update counters. Long campaigns can run for many minutes;
// since runCampaignSend is idempotent at the message_log level, the
// scheduler picks up where a previous tick left off if the worker
// restarts mid-send.

export const crmCampaignSender = inngest.createFunction(
  { id: 'crm-campaign-sender' },
  { cron: '* * * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'crm-campaign-sender' },
    })

    const result = await step.run('process', async () => {
      const due = await ctx.db
        .select({ id: schema.crmCampaigns.id })
        .from(schema.crmCampaigns)
        .where(
          sql`${schema.crmCampaigns.status} IN ('scheduled','sending') AND ${schema.crmCampaigns.scheduledFor} <= NOW()`,
        )
        .limit(5)

      const total = { sent: 0, skipped: 0, processed: 0 }
      for (const c of due) {
        const r = await crm.runCampaignSend(ctx, c.id)
        if (r.ok) {
          total.sent += r.value.sent
          total.skipped += r.value.skipped
          total.processed += 1
        }
      }
      return total
    })

    await flushAfterCommit()
    return result
  },
)

// A/B winner decider — runs every 30 minutes. Picks campaigns with both
// variants configured but no decision yet, applies decideAbWinner, and
// writes the result.
export const crmAbWinnerDecider = inngest.createFunction(
  { id: 'crm-ab-winner-decider' },
  { cron: '*/30 * * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'crm-ab-winner-decider' },
    })

    const result = await step.run('decide', async () => {
      const candidates = await ctx.db
        .select({ id: schema.crmCampaigns.id })
        .from(schema.crmCampaigns)
        .where(
          sql`${schema.crmCampaigns.abVariantATemplateId} IS NOT NULL
              AND ${schema.crmCampaigns.abVariantBTemplateId} IS NOT NULL
              AND ${schema.crmCampaigns.abWinningVariant} IS NULL
              AND ${schema.crmCampaigns.status} IN ('sending','sent')`,
        )
      let decided = 0
      for (const c of candidates) {
        const r = await crm.decideAbWinner(ctx, c.id)
        if (r.winner) decided += 1
      }
      return { evaluated: candidates.length, decided }
    })

    await flushAfterCommit()
    return result
  },
)

// Conversion attribution — every 15 minutes, walk campaigns with a
// configured conversion event and stamp matching player_events.
export const crmConversionAttribution = inngest.createFunction(
  { id: 'crm-conversion-attribution' },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'crm-conversion-attribution' },
    })

    const result = await step.run('attribute', async () => {
      const campaigns = await ctx.db
        .select({ id: schema.crmCampaigns.id })
        .from(schema.crmCampaigns)
        .where(
          sql`${schema.crmCampaigns.conversionEvent} IS NOT NULL AND ${schema.crmCampaigns.status} = 'sent'`,
        )
      let attributed = 0
      for (const c of campaigns) {
        attributed += await crm.attributeConversions(ctx, c.id)
      }
      return { campaigns: campaigns.length, attributed }
    })

    await flushAfterCommit()
    return result
  },
)
