import { sql } from 'drizzle-orm'
import { check, index, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, money, tstz, updatedAt } from './_shared'
import { paymentInstruments } from './payment-instruments'
import { players } from './players'

// docs/03 §7.3 — redemptions.
// FKs to admins (approved_by, rejected_by) added in cross-FK migration (step 24).

export const redemptions = pgTable(
  'redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),

    amountSc: money('amount_sc').notNull(),
    amountUsd: money('amount_usd').notNull(),

    method: text('method').notNull(),
    paymentInstrumentId: uuid('payment_instrument_id').references(() => paymentInstruments.id),

    drainPlan: jsonb('drain_plan').notNull(),

    status: text('status').notNull().default('requested'),

    approvedBy: uuid('approved_by'),
    approvedAt: tstz('approved_at'),
    approvalReason: text('approval_reason'),
    rejectedBy: uuid('rejected_by'),
    rejectedAt: tstz('rejected_at'),
    rejectionReason: text('rejection_reason'),
    rejectionCategory: text('rejection_category'),

    finixTransferId: text('finix_transfer_id').unique(),
    aptTransferId: text('apt_transfer_id').unique(),

    failureReason: text('failure_reason'),

    ledgerPairId: uuid('ledger_pair_id'),

    ipAtRequest: inet('ip_at_request'),
    stateAtRequest: text('state_at_request'),

    submittedToFinixAt: tstz('submitted_to_finix_at'),
    paidAt: tstz('paid_at'),

    gammaRedemptionId: text('gamma_redemption_id').unique(),

    fraudSignalsSnapshot: jsonb('fraud_signals_snapshot'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    requestedAt: tstz('requested_at').notNull().defaultNow(),
  },
  (t) => [
    index('redemptions_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('redemptions_status_idx').on(t.status, t.createdAt),
    index('redemptions_pending_review_idx')
      .on(t.createdAt)
      .where(sql`${t.status} in ('pending_review', 'kyc_pending', 'aml_hold')`),
    index('redemptions_awaiting_webhook_idx')
      .on(t.submittedToFinixAt)
      .where(sql`${t.status} = 'awaiting_webhook'`),
    check('redemptions_method_check', sql`${t.method} in ('finix_ach', 'apt_debit')`),
    check(
      'redemptions_status_check',
      sql`${t.status} in ('requested', 'pending_review', 'kyc_pending', 'approved', 'submitted', 'awaiting_webhook', 'paid', 'failed', 'rejected', 'cancelled', 'aml_hold')`,
    ),
  ],
)
