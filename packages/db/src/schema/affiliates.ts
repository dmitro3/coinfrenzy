import { sql } from 'drizzle-orm'
import { check, index, inet, integer, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, money, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §6 — affiliates.
export const affiliates = pgTable(
  'affiliates',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    displayName: text('display_name'),
    firstName: text('first_name'),
    lastName: text('last_name'),

    playerId: uuid('player_id').references(() => players.id),

    frenzyCreatorId: text('frenzy_creator_id'),

    revenueSharePct: numeric('revenue_share_pct', { precision: 5, scale: 4 })
      .notNull()
      .default('0'),
    baseCpaUsd: money('base_cpa_usd').default(sql`0`),

    status: text('status').notNull().default('active'),

    totalSignupsAttributed: integer('total_signups_attributed').notNull().default(0),
    totalActiveAttributed: integer('total_active_attributed').notNull().default(0),
    totalNgrAttributedSc: money('total_ngr_attributed_sc')
      .notNull()
      .default(sql`0`),
    totalPayoutsSc: money('total_payouts_sc')
      .notNull()
      .default(sql`0`),
    pendingPayoutSc: money('pending_payout_sc')
      .notNull()
      .default(sql`0`),

    gammaAffiliateId: text('gamma_affiliate_id').unique(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('affiliates_status_idx').on(t.status, sql`${t.totalNgrAttributedSc} desc`),
    index('affiliates_player_idx')
      .on(t.playerId)
      .where(sql`${t.playerId} is not null`),
    check('affiliates_status_check', sql`${t.status} in ('active', 'inactive', 'banned')`),
  ],
)

// docs/03 §6 — affiliate_codes.
export const affiliateCodes = pgTable(
  'affiliate_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id, { onDelete: 'cascade' }),

    code: text('code').notNull().unique(),
    campaignName: text('campaign_name'),

    signupsCount: integer('signups_count').notNull().default(0),

    status: text('status').notNull().default('active'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('affiliate_codes_affiliate_idx').on(t.affiliateId),
    check('affiliate_codes_status_check', sql`${t.status} in ('active', 'inactive')`),
  ],
)

// docs/03 §6 — affiliate_attribution.
export const affiliateAttribution = pgTable(
  'affiliate_attribution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .unique()
      .references(() => players.id, { onDelete: 'cascade' }),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id),

    source: text('source').notNull(),

    sourceDetail: text('source_detail'),
    campaignName: text('campaign_name'),

    attributedAt: tstz('attributed_at').notNull().defaultNow(),

    clickIp: inet('click_ip'),
    clickUserAgent: text('click_user_agent'),
    clickReferrer: text('click_referrer'),
  },
  (t) => [
    index('affiliate_attribution_affiliate_idx').on(t.affiliateId),
    index('affiliate_attribution_player_idx').on(t.playerId),
    check(
      'affiliate_attribution_source_check',
      sql`${t.source} in ('PROMO_CODE', 'LINK', 'MANUAL', 'FRENZY_CREATOR_PORTAL')`,
    ),
  ],
)

// docs/03 §6 — affiliate_payouts.
// `approved_by` FK added in cross-FK migration (step 24).
export const affiliatePayouts = pgTable(
  'affiliate_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id, { onDelete: 'restrict' }),

    periodLabel: text('period_label').notNull(),
    periodStart: tstz('period_start'),
    periodEnd: tstz('period_end'),

    amountSc: money('amount_sc').notNull(),

    status: text('status').notNull().default('pending'),

    approvedBy: uuid('approved_by'),
    approvedAt: tstz('approved_at'),

    paidAt: tstz('paid_at'),
    ledgerPairId: uuid('ledger_pair_id'),

    notes: text('notes'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('affiliate_payouts_affiliate_idx').on(t.affiliateId, sql`${t.createdAt} desc`),
    index('affiliate_payouts_status_idx').on(t.status, t.createdAt),
    check(
      'affiliate_payouts_status_check',
      sql`${t.status} in ('pending', 'approved', 'paid', 'cancelled')`,
    ),
  ],
)
