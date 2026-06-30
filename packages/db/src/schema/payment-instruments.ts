import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §7.2 — payment_instruments.

export const paymentInstruments = pgTable(
  'payment_instruments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    type: text('type').notNull(),

    displayName: text('display_name'),

    finixPaymentInstrumentId: text('finix_payment_instrument_id'),

    bankName: text('bank_name'),
    accountLast4: text('account_last4'),
    routingLast4: text('routing_last4'),

    plaidAccountId: text('plaid_account_id'),
    plaidValidationStatus: text('plaid_validation_status'),
    plaidValidationAt: tstz('plaid_validation_at'),

    aptCardToken: text('apt_card_token'),
    cardBrand: text('card_brand'),
    cardLast4: text('card_last4'),

    status: text('status').notNull().default('active'),
    disabledAt: tstz('disabled_at'),
    disabledReason: text('disabled_reason'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payment_instruments_player_idx').on(t.playerId, t.status),
    check('payment_instruments_type_check', sql`${t.type} in ('bank_account', 'debit_card')`),
    check('payment_instruments_status_check', sql`${t.status} in ('active', 'disabled')`),
  ],
)
