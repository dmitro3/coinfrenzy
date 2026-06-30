import { sql } from 'drizzle-orm'
import { index, inet, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { tstz } from './_shared'

// docs/03 §12 — blocklists. `added_by` FKs to admins added in step 24.

export const blockedEmails = pgTable('blocked_emails', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  addedBy: uuid('added_by'),
  addedAt: tstz('added_at').notNull().defaultNow(),
})

export const blockedDomains = pgTable('blocked_domains', {
  domain: text('domain').primaryKey(),
  reason: text('reason').notNull(),
  addedBy: uuid('added_by'),
  addedAt: tstz('added_at').notNull().defaultNow(),
})

export const blockedIps = pgTable(
  'blocked_ips',
  {
    ip: inet('ip').primaryKey(),
    reason: text('reason').notNull(),
    addedBy: uuid('added_by'),
    addedAt: tstz('added_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at'),
  },
  (t) => [
    // PG forbids non-IMMUTABLE functions in partial-index predicates. The
    // PK on ip already supports point lookups; this partial index narrows
    // scans/inspections to permanent (non-expiring) blocks. Time-bounded
    // blocks are filtered at query time via expires_at > now().
    index('blocked_ips_active_idx')
      .on(t.ip)
      .where(sql`${t.expiresAt} is null`),
  ],
)

export const blockedPromoCodes = pgTable('blocked_promo_codes', {
  code: text('code').primaryKey(),
  reason: text('reason').notNull(),
  addedBy: uuid('added_by'),
  addedAt: tstz('added_at').notNull().defaultNow(),
})
