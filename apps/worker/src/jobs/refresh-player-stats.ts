import { sql } from 'drizzle-orm'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/11 §3.1 — hourly rollup of active players' stats so segment
// compiler queries hit fresh aggregates instead of scanning player_events.
//
// "Active" = has emitted any event in the last 24 hours. We re-aggregate
// player_lifetime_stats / player_30d_stats / player_game_stats for that
// cohort. The full nightly job (refresh-player-stats-full.ts) covers
// everyone else.

export const refreshPlayerStatsHourly = inngest.createFunction(
  { id: 'refresh-player-stats-hourly' },
  { cron: '0 * * * *' }, // every hour at :00
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'refresh-player-stats-hourly' },
    })

    const result = await step.run('rollup', async () => {
      // ISO string — postgres-js cannot bind a raw JS Date as a parameter
      // through Drizzle's `db.execute(sql`...`)` path; it throws
      // ERR_INVALID_ARG_TYPE inside Buffer.byteLength.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const active = await ctx.db.execute(sql`
        SELECT DISTINCT player_id
        FROM player_events
        WHERE created_at >= ${since}
      `)
      const ids = (active as unknown as Array<{ player_id: string }>).map((r) => r.player_id)
      if (ids.length === 0) return { rollup_count: 0 }

      await refreshLifetimeStats(ctx, ids)
      await refresh30dStats(ctx, ids)
      await refreshGameStats(ctx, ids)

      return { rollup_count: ids.length }
    })

    await flushAfterCommit()
    return result
  },
)

import type { Context } from '@coinfrenzy/core'

// NOTE: do not use `WHERE p.id = ANY(${playerIds}::uuid[])`. Drizzle binds
// JS arrays inside `sql` templates as a record/tuple, so the SQL becomes
// `ANY(($1,$2,…)::uuid[])` and postgres throws
// `cannot cast type record to uuid[]`. We expand the array into a
// parameterised list via `sql.join` so each id is its own placeholder.
function idList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

async function refreshLifetimeStats(ctx: Context, playerIds: string[]): Promise<void> {
  await ctx.db.execute(sql`
    INSERT INTO player_lifetime_stats (
      player_id,
      total_deposited_usd,
      total_redeemed_usd,
      net_position_usd,
      total_wagered_sc,
      total_wagered_gc,
      total_won_sc,
      total_won_gc,
      ggr_sc,
      ngr_sc,
      purchase_count,
      redemption_count,
      pending_redemption_count,
      session_count,
      round_count,
      days_active,
      first_purchase_at,
      last_purchase_at,
      first_session_at,
      last_session_at,
      computed_at
    )
    SELECT
      p.id,
      COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN pu.amount_cents END) / 100.0, 0),
      COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.amount_usd END), 0),
      COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN pu.amount_cents END) / 100.0, 0)
        - COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.amount_usd END), 0),
      0, 0, 0, 0, 0, 0,
      COALESCE(COUNT(DISTINCT pu.id) FILTER (WHERE pu.status = 'completed'), 0),
      COALESCE(COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'paid'), 0),
      COALESCE(COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('requested','approved','submitted')), 0),
      0, 0, 0,
      MIN(CASE WHEN pu.status = 'completed' THEN pu.created_at END),
      MAX(CASE WHEN pu.status = 'completed' THEN pu.created_at END),
      NULL,
      NULL,
      NOW()
    FROM players p
    LEFT JOIN purchases pu ON pu.player_id = p.id
    LEFT JOIN redemptions r ON r.player_id = p.id
    WHERE p.id IN (${idList(playerIds)})
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
}

async function refresh30dStats(ctx: Context, playerIds: string[]): Promise<void> {
  await ctx.db.execute(sql`
    INSERT INTO player_30d_stats (
      player_id,
      deposited_usd_30d,
      redeemed_usd_30d,
      wagered_sc_30d,
      ngr_sc_30d,
      session_count_30d,
      days_active_30d,
      last_purchase_at,
      last_session_at,
      last_login_at,
      computed_at
    )
    SELECT
      p.id,
      COALESCE(SUM(CASE WHEN pu.status='completed' AND pu.created_at >= NOW() - INTERVAL '30 days' THEN pu.amount_cents END) / 100.0, 0),
      COALESCE(SUM(CASE WHEN r.status='paid' AND r.created_at >= NOW() - INTERVAL '30 days' THEN r.amount_usd END), 0),
      0, 0, 0, 0,
      MAX(CASE WHEN pu.status='completed' THEN pu.created_at END),
      NULL,
      p.last_login_at,
      NOW()
    FROM players p
    LEFT JOIN purchases pu ON pu.player_id = p.id
    LEFT JOIN redemptions r ON r.player_id = p.id
    WHERE p.id IN (${idList(playerIds)})
    GROUP BY p.id
    ON CONFLICT (player_id) DO UPDATE SET
      deposited_usd_30d = EXCLUDED.deposited_usd_30d,
      redeemed_usd_30d = EXCLUDED.redeemed_usd_30d,
      last_purchase_at = EXCLUDED.last_purchase_at,
      last_login_at = EXCLUDED.last_login_at,
      computed_at = NOW()
  `)
}

async function refreshGameStats(ctx: Context, playerIds: string[]): Promise<void> {
  // game_stats is per (player, game). We could refresh from player_events,
  // but at MVP scope the trigger sites already maintain per-round totals
  // via the alea webhook handler. Here we only refresh the rolling 7d/30d
  // windows so segments stay accurate.
  await ctx.db.execute(sql`
    UPDATE player_game_stats pgs
    SET
      last_7d_wagered_sc = COALESCE(sub7.total, 0),
      last_7d_rounds = COALESCE(sub7.rounds, 0),
      last_30d_wagered_sc = COALESCE(sub30.total, 0),
      last_30d_rounds = COALESCE(sub30.rounds, 0),
      computed_at = NOW()
    FROM (
      SELECT player_id, game_id,
        SUM(amount) AS total,
        COUNT(*) AS rounds
      FROM player_events
      WHERE event_name = 'player.game.bet'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY player_id, game_id
    ) sub7
    LEFT JOIN (
      SELECT player_id, game_id,
        SUM(amount) AS total,
        COUNT(*) AS rounds
      FROM player_events
      WHERE event_name = 'player.game.bet'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY player_id, game_id
    ) sub30 ON sub30.player_id = sub7.player_id AND sub30.game_id = sub7.game_id
    WHERE pgs.player_id = sub7.player_id AND pgs.game_id = sub7.game_id
      AND pgs.player_id IN (${idList(playerIds)})
  `)
}
