import { sql } from 'drizzle-orm'
import { check, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'

import { createdAt, money, updatedAt } from './_shared'

// docs/03 §3.1 — house_accounts. Seed rows inserted via the seed migration.

export const houseAccounts = pgTable(
  'house_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    currency: text('currency').notNull(),

    displayName: text('display_name').notNull(),
    description: text('description'),

    currentBalance: money('current_balance')
      .notNull()
      .default(sql`0`),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('house_accounts_kind_currency_unique').on(t.kind, t.currency),
    check('house_accounts_currency_check', sql`${t.currency} in ('GC', 'SC', 'USD')`),
  ],
)
