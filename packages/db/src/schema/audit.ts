import { sql } from 'drizzle-orm'
import { check, index, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { emptyJsonbDefault, tstz } from './_shared'

// docs/03 §10.6 — audit_log. Append-only via rules in §16.3.

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    actorKind: text('actor_kind').notNull(),
    actorId: uuid('actor_id'),
    actorRole: text('actor_role'),

    action: text('action').notNull(),
    resourceKind: text('resource_kind'),
    resourceId: uuid('resource_id'),

    before: jsonb('before'),
    after: jsonb('after'),

    reason: text('reason'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),

    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    occurredAt: tstz('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_actor_idx')
      .on(t.actorId, sql`${t.occurredAt} desc`)
      .where(sql`${t.actorId} is not null`),
    index('audit_log_action_idx').on(t.action, sql`${t.occurredAt} desc`),
    index('audit_log_resource_idx').on(t.resourceKind, t.resourceId, sql`${t.occurredAt} desc`),
    index('audit_log_occurred_idx').on(sql`${t.occurredAt} desc`),
    check('audit_log_actor_kind_check', sql`${t.actorKind} in ('admin', 'player', 'system')`),

    // Functional & partial indexes to speed up Alea transactions/rollbacks/deduplication checks
    index('audit_log_alea_rollback_round_idx')
      .on(sql`(metadata->>'round_id')`)
      .where(sql`action = 'webhook.alea.round_rollback'`),
    index('audit_log_alea_original_tx_idx')
      .on(sql`(metadata->>'original_tx_id')`)
      .where(sql`action = 'webhook.alea.round_rollback'`),
    index('audit_log_alea_pending_rollback_original_tx_idx')
      .on(sql`(metadata->>'original_tx_id')`)
      .where(sql`action = 'webhook.alea.pending_rollback'`),
    index('audit_log_alea_rollback_tx_idx')
      .on(sql`(metadata->>'rollback_tx_id')`)
      .where(sql`action = 'webhook.alea.round_rollback'`),
    index('audit_log_alea_tx_idx')
      .on(sql`(metadata->>'tx_id')`)
      .where(sql`action in ('webhook.alea.round_bet', 'webhook.alea.round_win')`),
  ],
)
