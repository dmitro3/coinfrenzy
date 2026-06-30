import { realtime, reports } from '@coinfrenzy/core'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/12 §9 — admin dashboard counter publisher.
//
// The spec calls for a 5-second cadence. Inngest cron's minimum granularity
// is 1 minute, so we run a self-rescheduling step that emits 12 ticks
// per invocation (every 5 seconds for one minute) and is restarted by the
// next cron tick. This way Pusher subscribers see a fresh payload every
// ~5 seconds without needing a long-lived process.
//
// If Pusher is unconfigured, `realtime.publishEvent` no-ops — the dashboard
// then falls back to the SSR-rendered values plus TanStack Query refresh on
// window focus (docs/10 §7.4).

const TICKS_PER_INVOCATION = 12 // 12 × 5s = 60s

export const publishDashboardCounters = inngest.createFunction(
  {
    id: 'publish-dashboard-counters',
    name: 'Publish dashboard counters → admin-dashboard-counters',
  },
  { cron: '* * * * *' }, // every minute, then we emit 12 ticks inside
  async ({ step }) => {
    const { ctx } = buildWorkerContext({
      loggerBindings: { job: 'publish-dashboard-counters' },
    })

    for (let i = 0; i < TICKS_PER_INVOCATION; i++) {
      // Each tick is its own step so failures don't take down the whole run.
      await step.run(`tick-${i}`, async () => {
        try {
          const payload = await reports.computeDashboardCounters(ctx.db)
          await realtime.publishEvent('admin-dashboard-counters', 'counters', payload)
          ctx.logger.debug('counters published', { tick: i })
        } catch (e) {
          ctx.logger.warn('counter publish failed', {
            tick: i,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      })
      if (i < TICKS_PER_INVOCATION - 1) {
        await step.sleep(`wait-${i}`, '5s')
      }
    }
    return { ticks: TICKS_PER_INVOCATION }
  },
)
