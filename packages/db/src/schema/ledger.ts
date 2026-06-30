import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  createdAt,
  emptyJsonbDefault,
  ledgerAccountKind,
  ledgerLeg,
  ledgerSource,
  money,
} from './_shared'

// docs/03 §3.2 — ledger_entries. Partitioned by month on created_at.
// IMPORTANT: Drizzle does not natively emit PARTITION BY; the generated
// migration SQL is hand-edited (or supplemented) to add:
//   - `partition by range (created_at)` on the parent table
//   - initial monthly partitions
// See docs/03 §3.2 + §16.4 and migration 0001_partitions_and_seed.sql.

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').notNull().defaultRandom(),

    source: ledgerSource('source').notNull(),
    sourceId: text('source_id').notNull(),
    idempotencyKey: text('idempotency_key'),

    pairId: uuid('pair_id').notNull(),
    leg: ledgerLeg('leg').notNull(),

    accountKind: ledgerAccountKind('account_kind').notNull(),
    accountId: uuid('account_id').notNull(),

    amount: money('amount').notNull(),
    currency: text('currency').notNull(),

    subBucket: text('sub_bucket'),

    playerId: uuid('player_id'),

    balanceAfter: money('balance_after'),

    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    uniqueIndex('ledger_entries_source_dedup_idx').on(
      t.source,
      t.sourceId,
      t.accountKind,
      t.accountId,
      t.leg,
      t.subBucket,
      t.createdAt,
    ),
    index('ledger_entries_account_idx').on(t.accountId, t.currency, sql`${t.createdAt} desc`),
    index('ledger_entries_player_idx')
      .on(t.playerId, sql`${t.createdAt} desc`)
      .where(sql`${t.playerId} is not null`),
    index('ledger_entries_pair_idx').on(t.pairId),
    index('ledger_entries_source_idx').on(t.source, t.sourceId),

    // Functional & partial index to speed up Alea transactions/rollbacks mapping originalTxId to roundId
    index('ledger_entries_alea_tx_idx')
      .on(sql`(metadata->>'tx_id')`)
      .where(sql`source in ('bet', 'win')`),

    check('ledger_entries_amount_positive', sql`${t.amount} > 0`),
    check('ledger_entries_currency_check', sql`${t.currency} in ('GC', 'SC', 'USD')`),
    check(
      'ledger_entries_sub_bucket_check',
      sql`${t.subBucket} is null or ${t.subBucket} in ('purchased', 'bonus', 'promo', 'earned')`,
    ),
  ],
)
