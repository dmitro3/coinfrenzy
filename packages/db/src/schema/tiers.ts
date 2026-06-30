import { sql } from 'drizzle-orm'
import { check, index, integer, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, money, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §5.1 — tiers. Seed: 6 default tiers.
export const tiers = pgTable(
  'tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    level: integer('level').notNull().unique(),

    xpRequired: money('xp_required')
      .notNull()
      .default(sql`0`),

    weeklyScBonus: money('weekly_sc_bonus')
      .notNull()
      .default(sql`0`),
    monthlyScBonus: money('monthly_sc_bonus')
      .notNull()
      .default(sql`0`),
    dailyLoginBonusMult: numeric('daily_login_bonus_mult', { precision: 5, scale: 2 })
      .notNull()
      .default('1.0'),
    cashbackPct: numeric('cashback_pct', { precision: 5, scale: 4 }).default('0'),

    iconUrl: text('icon_url'),
    badgeColor: text('badge_color'),
    description: text('description'),

    status: text('status').notNull().default('active'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('tiers_status_check', sql`${t.status} in ('active', 'inactive')`)],
)

// docs/03 §5.2 — tier_progress.
export const tierProgress = pgTable(
  'tier_progress',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => players.id, { onDelete: 'cascade' }),
    currentTierId: uuid('current_tier_id')
      .notNull()
      .references(() => tiers.id),
    currentTierLevel: integer('current_tier_level').notNull().default(1),

    currentXp: money('current_xp')
      .notNull()
      .default(sql`0`),
    xpForNextTier: money('xp_for_next_tier'),

    tierReachedAt: tstz('tier_reached_at').notNull().defaultNow(),
    lastWeeklyBonusAt: tstz('last_weekly_bonus_at'),
    lastMonthlyBonusAt: tstz('last_monthly_bonus_at'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tier_progress_tier_idx').on(t.currentTierId, sql`${t.currentXp} desc`),
    index('tier_progress_level_idx').on(sql`${t.currentTierLevel} desc`),
  ],
)

// docs/03 §5.3 — tier_history.
export const tierHistory = pgTable(
  'tier_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    fromTierId: uuid('from_tier_id').references(() => tiers.id),
    toTierId: uuid('to_tier_id')
      .notNull()
      .references(() => tiers.id),

    reason: text('reason').notNull(),
    xpAtChange: money('xp_at_change'),

    createdAt: createdAt(),
  },
  (t) => [index('tier_history_player_idx').on(t.playerId, sql`${t.createdAt} desc`)],
)
