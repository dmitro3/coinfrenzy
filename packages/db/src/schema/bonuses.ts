import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { bonusType, createdAt, money, tstz, updatedAt } from './_shared'
import { players } from './players'
import { tiers } from './tiers'

// docs/03 §5.5 — bonuses.

export const bonuses = pgTable(
  'bonuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),

    bonusType: bonusType('bonus_type').notNull(),

    awardGc: money('award_gc')
      .notNull()
      .default(sql`0`),
    awardSc: money('award_sc')
      .notNull()
      .default(sql`0`),
    awardFormula: jsonb('award_formula'),

    playthroughMultiplier: numeric('playthrough_multiplier', { precision: 5, scale: 2 })
      .notNull()
      .default('3.0'),
    playthroughWindowHours: integer('playthrough_window_hours'),
    gameWeightOverrides: jsonb('game_weight_overrides'),
    minBetForContribution: money('min_bet_for_contribution'),
    maxBetDuringPlaythrough: money('max_bet_during_playthrough'),

    minTierId: uuid('min_tier_id').references(() => tiers.id),
    maxPerPlayer: integer('max_per_player'),
    cooldownHours: integer('cooldown_hours'),
    stackable: boolean('stackable').notNull().default(false),

    status: text('status').notNull().default('active'),
    validFrom: tstz('valid_from'),
    validUntil: tstz('valid_until'),

    description: text('description'),
    terms: text('terms'),
    displayImageUrl: text('display_image_url'),

    awardedCountLifetime: integer('awarded_count_lifetime').notNull().default(0),

    // M4 — gate which templates a host (contractor) can award without
    // master approval. False by default; masters flip via /admin/bonus.
    hostAvailable: boolean('host_available').notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('bonuses_type_idx').on(t.bonusType, t.status),
    index('bonuses_active_idx')
      .on(t.status, t.validFrom, t.validUntil)
      .where(sql`${t.status} = 'active'`),
    index('bonuses_host_available_idx')
      .on(t.hostAvailable, t.status)
      .where(sql`${t.hostAvailable} = true`),
    check('bonuses_status_check', sql`${t.status} in ('active', 'inactive', 'archived')`),
  ],
)

// docs/03 §5.6 — bonuses_awarded.
// `awarded_by_admin` FK added in cross-FK migration (step 24).

export const bonusesAwarded = pgTable(
  'bonuses_awarded',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    bonusId: uuid('bonus_id')
      .notNull()
      .references(() => bonuses.id, { onDelete: 'restrict' }),

    gcAmount: money('gc_amount')
      .notNull()
      .default(sql`0`),
    scAmount: money('sc_amount')
      .notNull()
      .default(sql`0`),

    playthroughMultiplierSnapshot: numeric('playthrough_multiplier_snapshot', {
      precision: 5,
      scale: 2,
    }).notNull(),
    playthroughRequired: money('playthrough_required')
      .notNull()
      .default(sql`0`),
    playthroughProgress: money('playthrough_progress')
      .notNull()
      .default(sql`0`),
    playthroughComplete: boolean('playthrough_complete').notNull().default(false),

    gameWeightOverridesSnapshot: jsonb('game_weight_overrides_snapshot'),
    minBetForContributionSnapshot: money('min_bet_for_contribution_snapshot'),
    maxBetDuringPlaythroughSnapshot: money('max_bet_during_playthrough_snapshot'),

    expiresAt: tstz('expires_at'),

    status: text('status').notNull().default('active'),

    sourceKind: text('source_kind'),
    sourceId: text('source_id'),

    awardedByAdmin: uuid('awarded_by_admin'),
    awardReason: text('award_reason'),

    awardPairId: uuid('award_pair_id'),
    releasePairId: uuid('release_pair_id'),

    createdAt: createdAt(),
    completedAt: tstz('completed_at'),
  },
  (t) => [
    unique('bonuses_awarded_source_unique').on(t.sourceKind, t.sourceId),
    index('bonuses_awarded_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('bonuses_awarded_active_idx')
      .on(t.playerId, t.status)
      .where(sql`${t.status} = 'active'`),
    index('bonuses_awarded_bonus_idx').on(t.bonusId),
    index('bonuses_awarded_expiring_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'active' and ${t.expiresAt} is not null`),
    check(
      'bonuses_awarded_status_check',
      sql`${t.status} in ('pending', 'active', 'completed', 'expired', 'forfeited', 'reversed')`,
    ),
    // Pending bonuses (admin-granted, affiliate payouts, etc.) — index
    // separately so the player's Available Rewards popover can fetch
    // the inbox without scanning all award rows.
    index('bonuses_awarded_pending_idx')
      .on(t.playerId, sql`${t.createdAt} desc`)
      .where(sql`${t.status} = 'pending'`),
  ],
)
