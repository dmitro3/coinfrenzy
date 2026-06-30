import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, emptyJsonbDefault, tstz } from './_shared'
import { players } from './players'

// docs/03 §2.4 — compliance_flags.
// FKs to admins (cleared_by, created_by) added in cross-FK migration (step 24).

export const complianceFlags = pgTable(
  'compliance_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    flagType: text('flag_type').notNull(),
    severity: text('severity').notNull(),
    reason: text('reason').notNull(),

    expiresAt: tstz('expires_at'),
    clearedAt: tstz('cleared_at'),
    clearedBy: uuid('cleared_by'),
    clearedReason: text('cleared_reason'),

    importedFrom: text('imported_from'),
    importedSourceText: text('imported_source_text'),

    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    createdAt: createdAt(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    index('compliance_flags_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    // PG forbids non-IMMUTABLE functions (now()) in partial-index predicates.
    // We index on cleared_at IS NULL only; the time-based "not expired yet"
    // filter is applied at query time, where the planner can still narrow
    // via this partial index.
    index('compliance_flags_active_idx')
      .on(t.playerId, t.flagType)
      .where(sql`${t.clearedAt} is null`),
    index('compliance_flags_type_idx')
      .on(t.flagType, t.severity)
      .where(sql`${t.clearedAt} is null`),
    check('compliance_flags_severity_check', sql`${t.severity} in ('info', 'warn', 'block')`),
  ],
)
