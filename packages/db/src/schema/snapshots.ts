import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { money, tstz } from './_shared'
import { affiliates } from './affiliates'
import { games } from './games'

// docs/03 §14.1 — daily_operational_snapshots.

export const dailyOperationalSnapshots = pgTable(
  'daily_operational_snapshots',
  {
    date: date('date').primaryKey(),
    dayOfWeek: text('day_of_week').notNull(),

    dau: integer('dau').notNull().default(0),
    uniqueLogins: integer('unique_logins').notNull().default(0),
    newRegisteredPlayers: integer('new_registered_players').notNull().default(0),

    totalScStaked: money('total_sc_staked')
      .notNull()
      .default(sql`0`),
    totalScWon: money('total_sc_won')
      .notNull()
      .default(sql`0`),
    totalGgrSc: money('total_ggr_sc')
      .notNull()
      .default(sql`0`),
    totalNgrSc: money('total_ngr_sc')
      .notNull()
      .default(sql`0`),
    totalGcStaked: money('total_gc_staked')
      .notNull()
      .default(sql`0`),

    totalDepositsUsd: money('total_deposits_usd')
      .notNull()
      .default(sql`0`),
    depositorsCount: integer('depositors_count').notNull().default(0),
    firstTimePurchasers: integer('first_time_purchasers').notNull().default(0),
    withdrawalsRequestedSc: money('withdrawals_requested_sc')
      .notNull()
      .default(sql`0`),
    withdrawalsCompletedSc: money('withdrawals_completed_sc')
      .notNull()
      .default(sql`0`),
    withdrawalsCompletedUsd: money('withdrawals_completed_usd')
      .notNull()
      .default(sql`0`),

    bonusAmoe: money('bonus_amoe')
      .notNull()
      .default(sql`0`),
    bonusTier: money('bonus_tier')
      .notNull()
      .default(sql`0`),
    bonusDaily: money('bonus_daily')
      .notNull()
      .default(sql`0`),
    bonusPackage: money('bonus_package')
      .notNull()
      .default(sql`0`),
    bonusWelcome: money('bonus_welcome')
      .notNull()
      .default(sql`0`),
    bonusJackpot: money('bonus_jackpot')
      .notNull()
      .default(sql`0`),
    bonusReferral: money('bonus_referral')
      .notNull()
      .default(sql`0`),
    bonusAffiliate: money('bonus_affiliate')
      .notNull()
      .default(sql`0`),
    bonusPromotion: money('bonus_promotion')
      .notNull()
      .default(sql`0`),
    bonusWeeklyTier: money('bonus_weekly_tier')
      .notNull()
      .default(sql`0`),
    bonusMonthlyTier: money('bonus_monthly_tier')
      .notNull()
      .default(sql`0`),
    bonusAdminAddedSc: money('bonus_admin_added_sc')
      .notNull()
      .default(sql`0`),
    bonusCrmPromocode: money('bonus_crm_promocode')
      .notNull()
      .default(sql`0`),
    bonusPurchasePromocode: money('bonus_purchase_promocode')
      .notNull()
      .default(sql`0`),
    bonusTotal: money('bonus_total')
      .notNull()
      .default(sql`0`),

    abpPerDau: numeric('abp_per_dau', { precision: 10, scale: 2 }),
    aggrPerDau: numeric('aggr_per_dau', { precision: 10, scale: 2 }),
    angrPerDau: numeric('angr_per_dau', { precision: 10, scale: 2 }),

    generatedAt: tstz('generated_at').notNull().defaultNow(),
    generationDurationMs: integer('generation_duration_ms'),
    sourceHash: text('source_hash'),
  },
  (t) => [index('daily_snapshots_date_idx').on(sql`${t.date} desc`)],
)

// docs/03 §14.2 — specialized snapshots.

export const dailyPerStateSnapshot = pgTable(
  'daily_per_state_snapshot',
  {
    date: date('date').notNull(),
    state: text('state').notNull(),

    dau: integer('dau').notNull().default(0),
    newSignups: integer('new_signups').notNull().default(0),
    totalDepositedUsd: money('total_deposited_usd')
      .notNull()
      .default(sql`0`),
    totalRedeemedUsd: money('total_redeemed_usd')
      .notNull()
      .default(sql`0`),
    totalStakedSc: money('total_staked_sc')
      .notNull()
      .default(sql`0`),
    totalGgrSc: money('total_ggr_sc')
      .notNull()
      .default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.date, t.state] })],
)

export const dailyPerGameSnapshot = pgTable(
  'daily_per_game_snapshot',
  {
    date: date('date').notNull(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),

    uniquePlayers: integer('unique_players').notNull().default(0),
    totalRounds: integer('total_rounds').notNull().default(0),
    totalBetSc: money('total_bet_sc')
      .notNull()
      .default(sql`0`),
    totalWinSc: money('total_win_sc')
      .notNull()
      .default(sql`0`),
    ggrSc: money('ggr_sc')
      .notNull()
      .default(sql`0`),

    rtpRealized: numeric('rtp_realized', { precision: 5, scale: 4 }),
    rtpExpected: numeric('rtp_expected', { precision: 5, scale: 4 }),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.gameId] }),
    index('daily_per_game_date_idx').on(sql`${t.date} desc`),
  ],
)

export const dailyPerAffiliateSnapshot = pgTable(
  'daily_per_affiliate_snapshot',
  {
    date: date('date').notNull(),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id),

    attributedSignups: integer('attributed_signups').notNull().default(0),
    attributedActivePlayers: integer('attributed_active_players').notNull().default(0),
    attributedDepositsUsd: money('attributed_deposits_usd')
      .notNull()
      .default(sql`0`),
    attributedNgrSc: money('attributed_ngr_sc')
      .notNull()
      .default(sql`0`),
    payoutOwedSc: money('payout_owed_sc')
      .notNull()
      .default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.date, t.affiliateId] })],
)

export const dailyRedemptionRateSnapshot = pgTable('daily_redemption_rate_snapshot', {
  date: date('date').primaryKey(),
  revenueUsd: money('revenue_usd')
    .notNull()
    .default(sql`0`),
  redemptionsUsd: money('redemptions_usd')
    .notNull()
    .default(sql`0`),
  pendingUsd: money('pending_usd')
    .notNull()
    .default(sql`0`),
  cumulativeRevenueUsd: money('cumulative_revenue_usd')
    .notNull()
    .default(sql`0`),
  cumulativeRedemptionsUsd: money('cumulative_redemptions_usd')
    .notNull()
    .default(sql`0`),
  dailyRedemptionRate: numeric('daily_redemption_rate', { precision: 5, scale: 4 }),
  lifetimeRedemptionRate: numeric('lifetime_redemption_rate', { precision: 5, scale: 4 }),
  perState: jsonb('per_state'),
})
