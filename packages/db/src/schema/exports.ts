import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt, tstz } from './_shared'
import { admins } from './admin'

// docs/03 §14.3 — exports.
// JS const is named `dataExports` to avoid shadowing the CommonJS `exports`
// global when drizzle-kit transpiles to CJS.

export const dataExports = pgTable(
  'exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id),

    exportType: text('export_type').notNull(),
    querySpec: jsonb('query_spec'),

    status: text('status').notNull().default('pending'),

    rowCount: integer('row_count'),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }),
    r2Key: text('r2_key'),
    downloadUrl: text('download_url'),
    expiresAt: tstz('expires_at'),

    requiresReview: boolean('requires_review').notNull().default(false),
    reviewedBy: uuid('reviewed_by').references(() => admins.id),
    reviewedAt: tstz('reviewed_at'),

    reason: text('reason'),

    startedAt: tstz('started_at'),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('exports_admin_idx').on(t.adminId, sql`${t.createdAt} desc`),
    index('exports_status_idx')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} in ('pending', 'running')`),
    index('exports_review_idx')
      .on(t.createdAt)
      .where(sql`${t.requiresReview} = true and ${t.reviewedAt} is null`),
    check(
      'exports_status_check',
      sql`${t.status} in ('pending', 'running', 'complete', 'failed', 'expired')`,
    ),
  ],
)

// docs/03 §14.3 — report_subscriptions.

export const reportSubscriptions = pgTable(
  'report_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),

    reportKind: text('report_kind').notNull(),
    querySpec: jsonb('query_spec'),

    schedule: text('schedule').notNull(),
    emailTo: text('email_to').array().notNull(),
    emailSubject: text('email_subject'),

    enabled: boolean('enabled').notNull().default(true),
    lastSentAt: tstz('last_sent_at'),
    nextDueAt: tstz('next_due_at'),

    createdAt: createdAt(),
  },
  (t) => [
    index('report_subscriptions_due_idx')
      .on(t.nextDueAt)
      .where(sql`${t.enabled} = true`),
  ],
)
