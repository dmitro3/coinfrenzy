import { sql } from 'drizzle-orm'
import {
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

import { createdAt, tstz, updatedAt } from './_shared'
import { bonuses, bonusesAwarded } from './bonuses'
import { players } from './players'
import { tiers } from './tiers'

// docs/03 §5.7 — promo_codes.
// `created_by` FK added in cross-FK migration (step 24).

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    description: text('description'),

    bonusId: uuid('bonus_id')
      .notNull()
      .references(() => bonuses.id, { onDelete: 'restrict' }),

    playthroughMultiplier: numeric('playthrough_multiplier', { precision: 5, scale: 2 }),
    playthroughWindowHours: integer('playthrough_window_hours'),
    gameWeightOverrides: jsonb('game_weight_overrides'),

    requiredContext: text('required_context'),
    minTierId: uuid('min_tier_id').references(() => tiers.id),
    maxPerPlayer: integer('max_per_player').default(1),
    maxTotalUses: integer('max_total_uses'),
    usesCount: integer('uses_count').notNull().default(0),

    status: text('status').notNull().default('active'),
    validFrom: tstz('valid_from'),
    validUntil: tstz('valid_until'),

    blockedEmailDomains: text('blocked_email_domains').array(),

    createdBy: uuid('created_by'),
    campaignId: uuid('campaign_id'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('promo_codes_code_idx')
      .on(t.code)
      .where(sql`${t.status} = 'active'`),
    index('promo_codes_bonus_idx').on(t.bonusId),
    check(
      'promo_codes_required_context_check',
      sql`${t.requiredContext} is null or ${t.requiredContext} in ('signup', 'purchase', 'standalone')`,
    ),
    check('promo_codes_status_check', sql`${t.status} in ('active', 'inactive', 'archived')`),
  ],
)

// docs/03 §5.8 — promo_redemptions.

export const promoRedemptions = pgTable(
  'promo_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    promoCodeId: uuid('promo_code_id')
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),

    bonusAwardId: uuid('bonus_award_id').references(() => bonusesAwarded.id),

    context: text('context'),

    redeemedAt: tstz('redeemed_at').notNull().defaultNow(),
  },
  (t) => [
    unique('promo_redemptions_code_player_unique').on(t.promoCodeId, t.playerId),
    index('promo_redemptions_player_idx').on(t.playerId, sql`${t.redeemedAt} desc`),
    index('promo_redemptions_code_idx').on(t.promoCodeId, sql`${t.redeemedAt} desc`),
  ],
)
