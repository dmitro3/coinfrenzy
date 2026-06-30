import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, updatedAt } from './_shared'

// docs/09 — operator-tunable system safety caps and other cross-cutting
// configuration that should be editable at runtime without a code deploy.
//
// Each row is one named blob. The schema is deliberately key/value:
// validation lives in `packages/core/src/system/config.ts` keyed by
// the row's `key`. Today we store one row: `tier_caps`. Future caps
// (host weekly bonus ceiling, cashier auto-approve hard ceiling, etc.)
// can plug in without a schema migration.
//
// SAFETY MODEL: every read of system_config in core MUST clamp the
// returned values against a hardcoded outer ceiling (e.g.
// HARD_TIER_CEILINGS). Even a master admin row that says "100k SC/week"
// gets capped at the engineering-set bound. This is the last line of
// defense against the platform being given away through misconfig.

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
  createdAt: createdAt(),
})
