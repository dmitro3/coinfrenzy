import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, deletedAt, money, tstz, updatedAt } from './_shared'
import { tiers } from './tiers'

// docs/03 §5.4 — packages.
// `bonus_id` FK to bonuses added in cross-FK migration (step 24).

export const packages = pgTable(
  'packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),

    priceUsd: money('price_usd').notNull(),

    baseGc: money('base_gc').notNull(),
    baseSc: money('base_sc')
      .notNull()
      .default(sql`0`),
    bonusGc: money('bonus_gc')
      .notNull()
      .default(sql`0`),
    bonusSc: money('bonus_sc')
      .notNull()
      .default(sql`0`),

    playthroughMultiplier: numeric('playthrough_multiplier', { precision: 5, scale: 2 })
      .notNull()
      .default('1.0'),

    // docs/03 §5.4 — bonus portions can carry their own playthrough.
    // The operator's existing Gamma model: base SC clears at 1x, bonus SC
    // at 3x. GC defaults to 1x for both so it can be wagered freely.
    bonusScPlaythroughMultiplier: numeric('bonus_sc_playthrough_multiplier', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('3.0'),
    bonusGcPlaythroughMultiplier: numeric('bonus_gc_playthrough_multiplier', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('1.0'),

    bonusId: uuid('bonus_id'),

    promotionalLabel: text('promotional_label'),
    badgeColor: text('badge_color'),
    displayImageUrl: text('display_image_url'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),

    // docs/03 §5.4 — featured slot promo placement. At most one package
    // each in slot 1 and slot 2 (enforced by a partial unique index added
    // in migration 0015). Slots render as banner cards on top of the shop.
    featuredSlot: integer('featured_slot'),
    bannerHeadline: text('banner_headline'),
    bannerSubhead: text('banner_subhead'),
    bannerImageUrl: text('banner_image_url'),

    status: text('status').notNull().default('active'),
    validFrom: tstz('valid_from'),
    validUntil: tstz('valid_until'),

    firstPurchaseOnly: boolean('first_purchase_only').notNull().default(false),
    minTierId: uuid('min_tier_id').references(() => tiers.id),
    maxPerPlayer: integer('max_per_player'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('packages_status_idx')
      .on(t.status, t.sortOrder)
      .where(sql`${t.deletedAt} is null`),
    index('packages_first_purchase_idx')
      .on(t.firstPurchaseOnly)
      .where(sql`${t.firstPurchaseOnly} = true`),
    check('packages_status_check', sql`${t.status} in ('active', 'inactive', 'archived')`),
    check(
      'packages_featured_slot_range',
      sql`${t.featuredSlot} is null or ${t.featuredSlot} in (1, 2)`,
    ),
  ],
)
