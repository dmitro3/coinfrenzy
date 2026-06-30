import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'

import { tstz } from './_shared'
import { players } from './players'

// docs/03 §13 — pending_webhooks.

export const pendingWebhooks = pgTable(
  'pending_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    eventType: text('event_type').notNull(),

    rawBody: text('raw_body').notNull(),
    rawHeaders: jsonb('raw_headers').notNull(),

    receivedAt: tstz('received_at').notNull().defaultNow(),

    status: text('status').notNull().default('received'),

    processingAttempts: integer('processing_attempts').notNull().default(0),
    lastAttemptAt: tstz('last_attempt_at'),
    lastError: text('last_error'),

    processedAt: tstz('processed_at'),
  },
  (t) => [
    unique('pending_webhooks_provider_idempotency_unique').on(t.provider, t.idempotencyKey),
    index('pending_webhooks_status_idx')
      .on(t.status, t.receivedAt)
      .where(sql`${t.status} in ('received', 'processing', 'failed')`),
    index('pending_webhooks_provider_idx').on(t.provider, sql`${t.receivedAt} desc`),
    index('pending_webhooks_event_idx').on(t.eventType, sql`${t.receivedAt} desc`),
    check(
      'pending_webhooks_status_check',
      sql`${t.status} in ('received', 'processing', 'completed', 'failed', 'replayed_for_migration')`,
    ),
  ],
)

// docs/03 §13 — aml_review_queue. `resolved_by` FK to admins added in step 24.

export const amlReviewQueue = pgTable(
  'aml_review_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    footprintEventId: text('footprint_event_id'),

    status: text('status').notNull().default('open'),

    resolvedAt: tstz('resolved_at'),
    resolvedBy: uuid('resolved_by'),
    resolutionNotes: text('resolution_notes'),

    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('aml_review_queue_open_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'open'`),
    index('aml_review_queue_player_idx').on(t.playerId),
    check(
      'aml_review_queue_status_check',
      sql`${t.status} in ('open', 'cleared', 'hold_confirmed', 'escalated_legal')`,
    ),
  ],
)
