import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, money, tstz } from './_shared'
import { players } from './players'

// docs/03 §3.3 — admin_adjustments.
// FKs to admins (admin_id, approved_by) added in cross-FK migration (step 24).

export const adminAdjustments = pgTable(
  'admin_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    adminId: uuid('admin_id').notNull(),

    amount: money('amount').notNull(),
    currency: text('currency').notNull(),
    subBucket: text('sub_bucket'),
    direction: text('direction').notNull(),

    reason: text('reason').notNull(),
    reasonCategory: text('reason_category').notNull(),

    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvedBy: uuid('approved_by'),
    approvedAt: tstz('approved_at'),
    approvalThresholdUsd: money('approval_threshold_usd'),

    ledgerPairId: uuid('ledger_pair_id'),

    createdAt: createdAt(),
  },
  (t) => [
    index('admin_adjustments_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('admin_adjustments_admin_idx').on(t.adminId, sql`${t.createdAt} desc`),
    index('admin_adjustments_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.requiresApproval} = true and ${t.approvedAt} is null`),
    check('admin_adjustments_currency_check', sql`${t.currency} in ('GC', 'SC')`),
    check(
      'admin_adjustments_sub_bucket_check',
      sql`${t.subBucket} is null or ${t.subBucket} in ('purchased', 'bonus', 'promo', 'earned')`,
    ),
    check('admin_adjustments_direction_check', sql`${t.direction} in ('credit', 'debit')`),
  ],
)
