import { sql } from 'drizzle-orm'
import { bigint, check, index, inet, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, money, tstz, updatedAt } from './_shared'
import { packages } from './packages'
import { players } from './players'

// docs/03 §7.1 — purchases.

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),

    packageId: uuid('package_id').references(() => packages.id),

    amountUsd: money('amount_usd').notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),

    baseGc: money('base_gc')
      .notNull()
      .default(sql`0`),
    baseSc: money('base_sc')
      .notNull()
      .default(sql`0`),
    bonusGc: money('bonus_gc')
      .notNull()
      .default(sql`0`),
    bonusSc: money('bonus_sc')
      .notNull()
      .default(sql`0`),

    promoCode: text('promo_code'),

    finixTransferId: text('finix_transfer_id').unique(),
    finixPaymentInstrumentId: text('finix_payment_instrument_id'),
    finix3dsResult: text('finix_3ds_result'),
    finix3dsEci: text('finix_3ds_eci'),
    finixAvsResult: text('finix_avs_result'),
    finixCvvResult: text('finix_cvv_result'),
    finixCardLast4: text('finix_card_last4'),
    finixCardBrand: text('finix_card_brand'),

    status: text('status').notNull().default('pending'),

    failureReason: text('failure_reason'),
    failureMessage: text('failure_message'),

    attemptsCount: integer('attempts_count').notNull().default(1),
    abandonmentStep: text('abandonment_step'),

    ledgerPairId: uuid('ledger_pair_id'),

    ipAtPurchase: inet('ip_at_purchase'),
    stateAtPurchase: text('state_at_purchase'),

    gammaTransactionId: text('gamma_transaction_id').unique(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: tstz('completed_at'),
  },
  (t) => [
    index('purchases_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('purchases_status_idx').on(t.status, sql`${t.createdAt} desc`),
    index('purchases_finix_idx')
      .on(t.finixTransferId)
      .where(sql`${t.finixTransferId} is not null`),
    index('purchases_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      'purchases_status_check',
      sql`${t.status} in ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'disputed')`,
    ),
  ],
)
