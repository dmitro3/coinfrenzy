import { sql } from 'drizzle-orm'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/11 §3.1 — nightly full rollup. Re-aggregates every player's
// lifetime + 30d stats. Runs at 02:00 UTC. Heavier than the hourly
// active-only job; takes ~30 min at 5M players per docs/11 §9.

export const refreshPlayerStatsFull = inngest.createFunction(
  { id: 'refresh-player-stats-full' },
  { cron: '0 2 * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'refresh-player-stats-full' },
    })

    const result = await step.run('rollup', async () => {
      // Lifetime stats — single set-based UPSERT covering every player.
      await ctx.db.execute(sql`
        INSERT INTO player_lifetime_stats (
          player_id,
          total_deposited_usd,
          total_redeemed_usd,
          net_position_usd,
          purchase_count,
          redemption_count,
          pending_redemption_count,
          first_purchase_at,
          last_purchase_at,
          computed_at
        )
        SELECT
          p.id,
          COALESCE(SUM(CASE WHEN pu.status='completed' THEN pu.amount_cents END) / 100.0, 0),
          COALESCE(SUM(CASE WHEN r.status='paid' THEN r.amount_usd END), 0),
          COALESCE(SUM(CASE WHEN pu.status='completed' THEN pu.amount_cents END) / 100.0, 0)
            - COALESCE(SUM(CASE WHEN r.status='paid' THEN r.amount_usd END), 0),
          COALESCE(COUNT(DISTINCT pu.id) FILTER (WHERE pu.status='completed'), 0),
          COALESCE(COUNT(DISTINCT r.id) FILTER (WHERE r.status='paid'), 0),
          COALESCE(COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('requested','approved','submitted')), 0),
          MIN(CASE WHEN pu.status='completed' THEN pu.created_at END),
          MAX(CASE WHEN pu.status='completed' THEN pu.created_at END),
          NOW()
        FROM players p
        LEFT JOIN purchases pu ON pu.player_id = p.id
        LEFT JOIN redemptions r ON r.player_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        ON CONFLICT (player_id) DO UPDATE SET
          total_deposited_usd = EXCLUDED.total_deposited_usd,
          total_redeemed_usd = EXCLUDED.total_redeemed_usd,
          net_position_usd = EXCLUDED.net_position_usd,
          purchase_count = EXCLUDED.purchase_count,
          redemption_count = EXCLUDED.redemption_count,
          pending_redemption_count = EXCLUDED.pending_redemption_count,
          first_purchase_at = EXCLUDED.first_purchase_at,
          last_purchase_at = EXCLUDED.last_purchase_at,
          computed_at = NOW()
      `)

      await ctx.db.execute(sql`
        INSERT INTO player_30d_stats (
          player_id,
          deposited_usd_30d,
          redeemed_usd_30d,
          last_purchase_at,
          last_login_at,
          computed_at
        )
        SELECT
          p.id,
          COALESCE(SUM(CASE WHEN pu.status='completed' AND pu.created_at >= NOW() - INTERVAL '30 days' THEN pu.amount_cents END) / 100.0, 0),
          COALESCE(SUM(CASE WHEN r.status='paid' AND r.created_at >= NOW() - INTERVAL '30 days' THEN r.amount_usd END), 0),
          MAX(CASE WHEN pu.status='completed' THEN pu.created_at END),
          p.last_login_at,
          NOW()
        FROM players p
        LEFT JOIN purchases pu ON pu.player_id = p.id
        LEFT JOIN redemptions r ON r.player_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        ON CONFLICT (player_id) DO UPDATE SET
          deposited_usd_30d = EXCLUDED.deposited_usd_30d,
          redeemed_usd_30d = EXCLUDED.redeemed_usd_30d,
          last_purchase_at = EXCLUDED.last_purchase_at,
          last_login_at = EXCLUDED.last_login_at,
          computed_at = NOW()
      `)

      return { ok: true }
    })

    await flushAfterCommit()
    return result
  },
)
