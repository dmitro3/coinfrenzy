import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text } from 'drizzle-orm/pg-core'

import { tstz, updatedAt } from './_shared'

// docs/03 §13 — integration_health. Seed: 9 providers.

export const integrationHealth = pgTable(
  'integration_health',
  {
    provider: text('provider').primaryKey(),

    status: text('status').notNull().default('green'),

    lastSeenAt: tstz('last_seen_at'),
    lastSuccessAt: tstz('last_success_at'),
    lastFailureAt: tstz('last_failure_at'),

    errorCount1h: integer('error_count_1h').notNull().default(0),
    successCount1h: integer('success_count_1h').notNull().default(0),
    p99LatencyMs1h: integer('p99_latency_ms_1h'),
    duplicateCount1h: integer('duplicate_count_1h').notNull().default(0),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),

    updatedAt: updatedAt(),
  },
  (t) => [check('integration_health_status_check', sql`${t.status} in ('green', 'yellow', 'red')`)],
)
