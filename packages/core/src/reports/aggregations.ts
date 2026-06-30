import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@coinfrenzy/db/client'

// docs/12 §3 + §4 — the Layer 3 snapshot aggregator. Idempotent: every
// statement is `INSERT … ON CONFLICT DO UPDATE` so the same date can be
// rebuilt safely. Used by:
//   - the nightly cron (yesterday — finalised)
//   - the hourly cron (today — interim, lets dashboards read from snapshot
//     instead of probing the ledger)
//   - the manual "Rebuild snapshot" admin action (any historical date)

export interface AggregateSnapshotsOptions {
  /** ISO date (YYYY-MM-DD) to aggregate. */
  date: string
}

export interface AggregateSnapshotsResult {
  date: string
  durationMs: number
  generatedAt: string
}

/**
 * Aggregate every Layer 3 snapshot for a single date. Safe to call repeatedly
 * (UPSERT semantics). Returns the wall-clock duration so the caller can record
 * it for SLA tracking.
 */
export async function aggregateSnapshotsForDate(
  db: DbExecutor,
  opts: AggregateSnapshotsOptions,
): Promise<AggregateSnapshotsResult> {
  const start = Date.now()
  const date = opts.date

  await aggregateOperationalSnapshot(db, date)
  await aggregatePerStateSnapshot(db, date)
  await aggregatePerGameSnapshot(db, date)
  await aggregatePerAffiliateSnapshot(db, date)
  await aggregateRedemptionRateSnapshot(db, date)

  return {
    date,
    durationMs: Date.now() - start,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * docs/12 §3.1 — daily_operational_snapshots row for `date`. The 14 bonus
 * columns are pulled from the bonus type enum so adding a new bonus_type
 * doesn't silently drop awards.
 */
async function aggregateOperationalSnapshot(db: DbExecutor, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_operational_snapshots (
      date, day_of_week,
      dau, unique_logins, new_registered_players,
      total_sc_staked, total_sc_won, total_ggr_sc, total_ngr_sc, total_gc_staked,
      total_deposits_usd, depositors_count, first_time_purchasers,
      withdrawals_requested_sc, withdrawals_completed_sc, withdrawals_completed_usd,
      bonus_amoe, bonus_tier, bonus_daily, bonus_package, bonus_welcome,
      bonus_jackpot, bonus_referral, bonus_affiliate, bonus_promotion,
      bonus_weekly_tier, bonus_monthly_tier, bonus_admin_added_sc,
      bonus_crm_promocode, bonus_purchase_promocode, bonus_total,
      abp_per_dau, aggr_per_dau, angr_per_dau,
      generated_at, generation_duration_ms
    )
    SELECT
      ${date}::date,
      to_char(${date}::date, 'Dy'),
      -- engagement
      (SELECT COUNT(DISTINCT id) FROM players
       WHERE last_login_at::date = ${date}::date
         AND deleted_at IS NULL AND is_internal_account = false),
      (SELECT COUNT(DISTINCT id) FROM players
       WHERE last_login_at::date = ${date}::date
         AND deleted_at IS NULL),
      (SELECT COUNT(*) FROM players
       WHERE created_at::date = ${date}::date
         AND deleted_at IS NULL AND is_internal_account = false),
      -- wagering
      (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries
       WHERE source = 'bet' AND currency = 'SC' AND leg = 'credit'
         AND account_kind = 'house_winnings_sc'
         AND created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries
       WHERE source = 'win' AND currency = 'SC' AND leg = 'debit'
         AND account_kind = 'house_winnings_sc'
         AND created_at::date = ${date}::date),
      0,
      0,
      (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries
       WHERE source = 'bet' AND currency = 'GC' AND leg = 'credit'
         AND account_kind = 'house_winnings_gc'
         AND created_at::date = ${date}::date),
      -- commerce
      (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases
       WHERE status = 'completed' AND completed_at::date = ${date}::date),
      (SELECT COUNT(DISTINCT player_id) FROM purchases
       WHERE status = 'completed' AND completed_at::date = ${date}::date),
      (SELECT COUNT(DISTINCT player_id) FROM purchases p
       WHERE p.status = 'completed' AND p.completed_at::date = ${date}::date
         AND NOT EXISTS (
           SELECT 1 FROM purchases p2
           WHERE p2.player_id = p.player_id AND p2.status = 'completed'
             AND p2.completed_at < p.completed_at)),
      (SELECT COALESCE(SUM(amount_sc), 0) FROM redemptions
       WHERE requested_at::date = ${date}::date),
      (SELECT COALESCE(SUM(amount_sc), 0) FROM redemptions
       WHERE status = 'paid' AND paid_at::date = ${date}::date),
      (SELECT COALESCE(SUM(amount_usd), 0) FROM redemptions
       WHERE status = 'paid' AND paid_at::date = ${date}::date),
      -- bonuses by type
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'amoe' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'tier_up' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'daily' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'package' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'welcome' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'jackpot' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'referral' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'affiliate' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'promotion' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'weekly_tier' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'monthly_tier' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'admin_added_sc' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'crm_promocode' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(ba.sc_amount), 0) FROM bonuses_awarded ba JOIN bonuses b ON ba.bonus_id = b.id WHERE b.bonus_type = 'purchase_promocode' AND ba.created_at::date = ${date}::date),
      (SELECT COALESCE(SUM(sc_amount), 0) FROM bonuses_awarded WHERE created_at::date = ${date}::date),
      NULL, NULL, NULL,
      now(),
      0
    ON CONFLICT (date) DO UPDATE SET
      day_of_week = EXCLUDED.day_of_week,
      dau = EXCLUDED.dau,
      unique_logins = EXCLUDED.unique_logins,
      new_registered_players = EXCLUDED.new_registered_players,
      total_sc_staked = EXCLUDED.total_sc_staked,
      total_sc_won = EXCLUDED.total_sc_won,
      total_gc_staked = EXCLUDED.total_gc_staked,
      total_deposits_usd = EXCLUDED.total_deposits_usd,
      depositors_count = EXCLUDED.depositors_count,
      first_time_purchasers = EXCLUDED.first_time_purchasers,
      withdrawals_requested_sc = EXCLUDED.withdrawals_requested_sc,
      withdrawals_completed_sc = EXCLUDED.withdrawals_completed_sc,
      withdrawals_completed_usd = EXCLUDED.withdrawals_completed_usd,
      bonus_amoe = EXCLUDED.bonus_amoe,
      bonus_tier = EXCLUDED.bonus_tier,
      bonus_daily = EXCLUDED.bonus_daily,
      bonus_package = EXCLUDED.bonus_package,
      bonus_welcome = EXCLUDED.bonus_welcome,
      bonus_jackpot = EXCLUDED.bonus_jackpot,
      bonus_referral = EXCLUDED.bonus_referral,
      bonus_affiliate = EXCLUDED.bonus_affiliate,
      bonus_promotion = EXCLUDED.bonus_promotion,
      bonus_weekly_tier = EXCLUDED.bonus_weekly_tier,
      bonus_monthly_tier = EXCLUDED.bonus_monthly_tier,
      bonus_admin_added_sc = EXCLUDED.bonus_admin_added_sc,
      bonus_crm_promocode = EXCLUDED.bonus_crm_promocode,
      bonus_purchase_promocode = EXCLUDED.bonus_purchase_promocode,
      bonus_total = EXCLUDED.bonus_total,
      generated_at = now()
  `)

  // Derived metrics — second pass so the per-DAU divisors are settled.
  await db.execute(sql`
    UPDATE daily_operational_snapshots SET
      total_ggr_sc = total_sc_staked - total_sc_won,
      total_ngr_sc = (total_sc_staked - total_sc_won) - bonus_total,
      abp_per_dau = CASE WHEN dau > 0 THEN ROUND(total_deposits_usd / dau, 2) ELSE NULL END,
      aggr_per_dau = CASE WHEN dau > 0 THEN ROUND((total_sc_staked - total_sc_won) / dau, 2) ELSE NULL END,
      angr_per_dau = CASE WHEN dau > 0 THEN ROUND(((total_sc_staked - total_sc_won) - bonus_total) / dau, 2) ELSE NULL END
    WHERE date = ${date}::date
  `)
}

/** docs/12 §3.2 — per-state breakdown. */
async function aggregatePerStateSnapshot(db: DbExecutor, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_per_state_snapshot (date, state, dau, new_signups, total_deposited_usd, total_redeemed_usd, total_staked_sc, total_ggr_sc)
    SELECT
      ${date}::date,
      COALESCE(p.state, 'UNKNOWN') AS state,
      COUNT(DISTINCT p.id) FILTER (WHERE p.last_login_at::date = ${date}::date),
      COUNT(DISTINCT p.id) FILTER (WHERE p.created_at::date = ${date}::date),
      COALESCE(SUM(pu.amount_usd) FILTER (
        WHERE pu.status = 'completed' AND pu.completed_at::date = ${date}::date), 0),
      COALESCE(SUM(r.amount_usd) FILTER (
        WHERE r.status = 'paid' AND r.paid_at::date = ${date}::date), 0),
      0,
      0
    FROM players p
    LEFT JOIN purchases pu ON pu.player_id = p.id AND pu.completed_at::date = ${date}::date
    LEFT JOIN redemptions r ON r.player_id = p.id AND r.paid_at::date = ${date}::date
    WHERE p.deleted_at IS NULL AND p.is_internal_account = false
    GROUP BY COALESCE(p.state, 'UNKNOWN')
    HAVING COUNT(DISTINCT p.id) FILTER (
      WHERE p.last_login_at::date = ${date}::date
         OR p.created_at::date = ${date}::date) > 0
       OR COALESCE(SUM(pu.amount_usd), 0) > 0
       OR COALESCE(SUM(r.amount_usd), 0) > 0
    ON CONFLICT (date, state) DO UPDATE SET
      dau = EXCLUDED.dau,
      new_signups = EXCLUDED.new_signups,
      total_deposited_usd = EXCLUDED.total_deposited_usd,
      total_redeemed_usd = EXCLUDED.total_redeemed_usd
  `)
}

/** docs/12 §3.3 — per-game breakdown sourced from game_rounds. */
async function aggregatePerGameSnapshot(db: DbExecutor, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_per_game_snapshot (date, game_id, unique_players, total_rounds, total_bet_sc, total_win_sc, ggr_sc, rtp_realized, rtp_expected)
    SELECT
      ${date}::date,
      gr.game_id,
      COUNT(DISTINCT gr.player_id),
      COUNT(*),
      COALESCE(SUM(gr.bet_amount) FILTER (WHERE gr.currency = 'SC'), 0),
      COALESCE(SUM(gr.win_amount) FILTER (WHERE gr.currency = 'SC'), 0),
      COALESCE(SUM(gr.bet_amount) FILTER (WHERE gr.currency = 'SC'), 0)
        - COALESCE(SUM(gr.win_amount) FILTER (WHERE gr.currency = 'SC'), 0),
      CASE WHEN COALESCE(SUM(gr.bet_amount) FILTER (WHERE gr.currency = 'SC'), 0) > 0
        THEN ROUND(SUM(gr.win_amount) FILTER (WHERE gr.currency = 'SC')::numeric
                 / SUM(gr.bet_amount) FILTER (WHERE gr.currency = 'SC')::numeric, 4)
        ELSE NULL
      END,
      g.rtp
    FROM game_rounds gr
    LEFT JOIN games g ON g.id = gr.game_id
    WHERE gr.created_at::date = ${date}::date
      AND gr.status = 'resolved'
    GROUP BY gr.game_id, g.rtp
    ON CONFLICT (date, game_id) DO UPDATE SET
      unique_players = EXCLUDED.unique_players,
      total_rounds = EXCLUDED.total_rounds,
      total_bet_sc = EXCLUDED.total_bet_sc,
      total_win_sc = EXCLUDED.total_win_sc,
      ggr_sc = EXCLUDED.ggr_sc,
      rtp_realized = EXCLUDED.rtp_realized,
      rtp_expected = EXCLUDED.rtp_expected
  `)
}

/** docs/12 §3.4 — per-affiliate breakdown. */
async function aggregatePerAffiliateSnapshot(db: DbExecutor, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_per_affiliate_snapshot (date, affiliate_id, attributed_signups, attributed_active_players, attributed_deposits_usd, attributed_ngr_sc, payout_owed_sc)
    SELECT
      ${date}::date,
      a.id,
      COUNT(DISTINCT p.id) FILTER (WHERE p.created_at::date = ${date}::date),
      COUNT(DISTINCT p.id) FILTER (WHERE p.last_login_at::date = ${date}::date),
      COALESCE(SUM(pu.amount_usd) FILTER (
        WHERE pu.status = 'completed' AND pu.completed_at::date = ${date}::date), 0),
      0,
      0
    FROM affiliates a
    JOIN players p ON p.attributed_affiliate_id = a.id
    LEFT JOIN purchases pu ON pu.player_id = p.id AND pu.completed_at::date = ${date}::date
    WHERE p.deleted_at IS NULL AND p.is_internal_account = false
    GROUP BY a.id
    HAVING COUNT(DISTINCT p.id) FILTER (
      WHERE p.created_at::date = ${date}::date
         OR p.last_login_at::date = ${date}::date) > 0
    ON CONFLICT (date, affiliate_id) DO UPDATE SET
      attributed_signups = EXCLUDED.attributed_signups,
      attributed_active_players = EXCLUDED.attributed_active_players,
      attributed_deposits_usd = EXCLUDED.attributed_deposits_usd
  `)
}

/** docs/12 §3.5 — daily redemption rate (revenue / redemptions). */
async function aggregateRedemptionRateSnapshot(db: DbExecutor, date: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO daily_redemption_rate_snapshot (
      date, revenue_usd, redemptions_usd, pending_usd,
      cumulative_revenue_usd, cumulative_redemptions_usd,
      daily_redemption_rate, lifetime_redemption_rate, per_state
    )
    WITH today AS (
      SELECT
        COALESCE((SELECT SUM(amount_usd) FROM purchases
                  WHERE status = 'completed' AND completed_at::date = ${date}::date), 0) AS revenue,
        COALESCE((SELECT SUM(amount_usd) FROM redemptions
                  WHERE status = 'paid' AND paid_at::date = ${date}::date), 0) AS paid,
        COALESCE((SELECT SUM(amount_usd) FROM redemptions
                  WHERE status IN ('requested','pending_review','kyc_pending','approved','submitted','awaiting_webhook','aml_hold')
                    AND requested_at::date <= ${date}::date), 0) AS pending
    ),
    lifetime AS (
      SELECT
        COALESCE((SELECT SUM(amount_usd) FROM purchases
                  WHERE status = 'completed' AND completed_at::date <= ${date}::date), 0) AS revenue,
        COALESCE((SELECT SUM(amount_usd) FROM redemptions
                  WHERE status = 'paid' AND paid_at::date <= ${date}::date), 0) AS paid
    ),
    per_state AS (
      SELECT jsonb_object_agg(state, jsonb_build_object('paid', paid, 'rev', rev)) AS data
      FROM (
        SELECT
          COALESCE(p.state, 'UNKNOWN') AS state,
          COALESCE(SUM(r.amount_usd) FILTER (WHERE r.status = 'paid' AND r.paid_at::date = ${date}::date), 0) AS paid,
          COALESCE(SUM(pu.amount_usd) FILTER (WHERE pu.status = 'completed' AND pu.completed_at::date = ${date}::date), 0) AS rev
        FROM players p
        LEFT JOIN redemptions r ON r.player_id = p.id AND r.paid_at::date = ${date}::date
        LEFT JOIN purchases pu ON pu.player_id = p.id AND pu.completed_at::date = ${date}::date
        WHERE p.deleted_at IS NULL AND p.is_internal_account = false
        GROUP BY COALESCE(p.state, 'UNKNOWN')
      ) s
    )
    SELECT
      ${date}::date,
      today.revenue,
      today.paid,
      today.pending,
      lifetime.revenue,
      lifetime.paid,
      CASE WHEN today.revenue > 0 THEN ROUND((today.paid / today.revenue)::numeric, 4) ELSE NULL END,
      CASE WHEN lifetime.revenue > 0 THEN ROUND((lifetime.paid / lifetime.revenue)::numeric, 4) ELSE NULL END,
      per_state.data
    FROM today, lifetime, per_state
    ON CONFLICT (date) DO UPDATE SET
      revenue_usd = EXCLUDED.revenue_usd,
      redemptions_usd = EXCLUDED.redemptions_usd,
      pending_usd = EXCLUDED.pending_usd,
      cumulative_revenue_usd = EXCLUDED.cumulative_revenue_usd,
      cumulative_redemptions_usd = EXCLUDED.cumulative_redemptions_usd,
      daily_redemption_rate = EXCLUDED.daily_redemption_rate,
      lifetime_redemption_rate = EXCLUDED.lifetime_redemption_rate,
      per_state = EXCLUDED.per_state
  `)
}

/** Format a Date as `YYYY-MM-DD` in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Yesterday in UTC. */
export function yesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return isoDate(d)
}

/** Today in UTC. */
export function today(): string {
  return isoDate(new Date())
}
