import { and, eq, gte, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'

import { bonus as bonusEngine } from '@coinfrenzy/core'
import { schema } from '@coinfrenzy/db'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/06 §13 — `weekly_tier` trigger. Mondays 09:00 UTC. The amount comes
// from the bonus template's `tier_match` formula; we only fan out the
// invocation per eligible player.
//
// Eligibility: tier_progress.current_tier_level >= 2 AND
// last_weekly_bonus_at IS NULL OR older than 6 days. We update
// `last_weekly_bonus_at` on each successful award so re-running this job
// (manual replay, Inngest retry) is safe.

export const weeklyTierBonuses = inngest.createFunction(
  { id: 'weekly-tier-bonuses' },
  { cron: '0 9 * * 1' }, // Mondays 09:00 UTC
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'weekly-tier-bonuses' },
    })

    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3_600_000)
    const players = await step.run('select-eligible', async () =>
      ctx.db
        .select({ playerId: schema.tierProgress.playerId })
        .from(schema.tierProgress)
        .where(
          and(
            gte(schema.tierProgress.currentTierLevel, 2),
            or(
              isNull(schema.tierProgress.lastWeeklyBonusAt),
              lt(schema.tierProgress.lastWeeklyBonusAt, sixDaysAgo),
            ),
          ),
        )
        .limit(5000),
    )

    let awarded = 0
    const today = new Date()
    const week = isoWeek(today)
    for (const row of players) {
      const result = await bonusEngine.awardBySlug(ctx, bonusEngine.BONUS_SLUGS.weeklyTier, {
        playerId: row.playerId,
        sourceKind: 'weekly_cron',
        sourceId: `${row.playerId}:${week}`,
        reason: `Weekly tier bonus ${week}`,
      })
      if (!result.ok) continue
      if (result.value.status === 'awarded') {
        awarded += 1
        await ctx.db
          .update(schema.tierProgress)
          .set({ lastWeeklyBonusAt: today, updatedAt: today })
          .where(eq(schema.tierProgress.playerId, row.playerId))
      }
    }

    await flushAfterCommit()
    return { eligible: players.length, awarded, week }
  },
)

export const monthlyTierBonuses = inngest.createFunction(
  { id: 'monthly-tier-bonuses' },
  { cron: '0 9 1 * *' }, // 1st of month, 09:00 UTC
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'monthly-tier-bonuses' },
    })

    const players = await step.run('select-eligible', async () =>
      ctx.db
        .select({ playerId: schema.tierProgress.playerId })
        .from(schema.tierProgress)
        .where(
          and(
            gte(schema.tierProgress.currentTierLevel, 2),
            // Re-fire after 29 days minimum; the cron only runs on the 1st
            // anyway so this is a belt-and-suspenders guard against retries.
            sql`coalesce(${schema.tierProgress.lastMonthlyBonusAt}, '1970-01-01'::timestamptz) < now() - interval '29 days'`,
            isNotNull(schema.tierProgress.currentTierId),
          ),
        )
        .limit(5000),
    )

    let awarded = 0
    const today = new Date()
    const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
    for (const row of players) {
      const result = await bonusEngine.awardBySlug(ctx, bonusEngine.BONUS_SLUGS.monthlyTier, {
        playerId: row.playerId,
        sourceKind: 'monthly_cron',
        sourceId: `${row.playerId}:${month}`,
        reason: `Monthly tier bonus ${month}`,
      })
      if (!result.ok) continue
      if (result.value.status === 'awarded') {
        awarded += 1
        await ctx.db
          .update(schema.tierProgress)
          .set({ lastMonthlyBonusAt: today, updatedAt: today })
          .where(eq(schema.tierProgress.playerId, row.playerId))
      }
    }

    await flushAfterCommit()
    return { eligible: players.length, awarded, month }
  },
)

function isoWeek(date: Date): string {
  // ISO week (YYYY-Www) — stable per-week key for idempotency.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
