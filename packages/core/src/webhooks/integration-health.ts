import { eq, sql } from 'drizzle-orm'

import { type DbExecutor, schema } from '@coinfrenzy/db'

import type { IntegrationHealthMark, WebhookProvider } from './types'

// docs/05 §8 + docs/08 §13. Each receipt updates these counters; the admin
// Integrity page reads from this table directly.
//
// Status state machine per docs/05 §8 thresholds:
//   - 3+ consecutive failures      -> red
//   - last_success_at > 30 min ago -> red
//   - last_success_at > 5 min ago  -> yellow
//   - error_count_1h > 5% of total -> yellow
//   - otherwise                    -> green
//
// We track 1h counters as approximate (rolling per-receipt) — the nightly
// stats job (prompt 12) will reset them. For dev usefulness we currently
// just increment on each call; tests assert the trend not the exact value.

const YELLOW_AGE_MS = 5 * 60 * 1000
const RED_AGE_MS = 30 * 60 * 1000
const RED_CONSECUTIVE_FAILURES = 3
const YELLOW_ERROR_RATE = 0.01
const RED_ERROR_RATE = 0.05

interface CurrentHealthRow {
  status: 'green' | 'yellow' | 'red'
  lastSeenAt: Date | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  errorCount1h: number
  successCount1h: number
  duplicateCount1h: number
  p99LatencyMs1h: number | null
  consecutiveFailures: number
}

export async function markIntegrationHealth(
  db: DbExecutor,
  mark: IntegrationHealthMark,
): Promise<void> {
  const provider = mark.provider
  const now = new Date()

  const rows = await db
    .select({
      status: schema.integrationHealth.status,
      lastSeenAt: schema.integrationHealth.lastSeenAt,
      lastSuccessAt: schema.integrationHealth.lastSuccessAt,
      lastFailureAt: schema.integrationHealth.lastFailureAt,
      errorCount1h: schema.integrationHealth.errorCount1h,
      successCount1h: schema.integrationHealth.successCount1h,
      duplicateCount1h: schema.integrationHealth.duplicateCount1h,
      p99LatencyMs1h: schema.integrationHealth.p99LatencyMs1h,
      consecutiveFailures: schema.integrationHealth.consecutiveFailures,
    })
    .from(schema.integrationHealth)
    .where(eq(schema.integrationHealth.provider, provider))
    .limit(1)

  const current: CurrentHealthRow = rows[0]
    ? {
        status: rows[0].status as 'green' | 'yellow' | 'red',
        lastSeenAt: rows[0].lastSeenAt,
        lastSuccessAt: rows[0].lastSuccessAt,
        lastFailureAt: rows[0].lastFailureAt,
        errorCount1h: rows[0].errorCount1h ?? 0,
        successCount1h: rows[0].successCount1h ?? 0,
        duplicateCount1h: rows[0].duplicateCount1h ?? 0,
        p99LatencyMs1h: rows[0].p99LatencyMs1h,
        consecutiveFailures: rows[0].consecutiveFailures ?? 0,
      }
    : {
        status: 'green',
        lastSeenAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        errorCount1h: 0,
        successCount1h: 0,
        duplicateCount1h: 0,
        p99LatencyMs1h: null,
        consecutiveFailures: 0,
      }

  const nextErrorCount1h = current.errorCount1h + (mark.outcome === 'failure' ? 1 : 0)
  const nextSuccessCount1h = current.successCount1h + (mark.outcome === 'success' ? 1 : 0)
  const nextDuplicateCount1h = current.duplicateCount1h + (mark.outcome === 'duplicate' ? 1 : 0)
  const nextConsecutiveFailures = mark.outcome === 'failure' ? current.consecutiveFailures + 1 : 0

  const nextLastSeenAt = now
  const nextLastSuccessAt = mark.outcome === 'success' ? now : current.lastSuccessAt
  const nextLastFailureAt = mark.outcome === 'failure' ? now : current.lastFailureAt

  const nextP99 =
    mark.latencyMs != null
      ? Math.max(current.p99LatencyMs1h ?? 0, mark.latencyMs)
      : current.p99LatencyMs1h

  const computedStatus = computeStatus({
    lastSuccessAt: nextLastSuccessAt,
    consecutiveFailures: nextConsecutiveFailures,
    errorCount1h: nextErrorCount1h,
    successCount1h: nextSuccessCount1h,
    now,
  })

  if (!rows[0]) {
    await db.insert(schema.integrationHealth).values({
      provider,
      status: computedStatus,
      lastSeenAt: nextLastSeenAt,
      lastSuccessAt: nextLastSuccessAt,
      lastFailureAt: nextLastFailureAt,
      errorCount1h: nextErrorCount1h,
      successCount1h: nextSuccessCount1h,
      duplicateCount1h: nextDuplicateCount1h,
      p99LatencyMs1h: nextP99 ?? null,
      consecutiveFailures: nextConsecutiveFailures,
    })
    return
  }

  await db
    .update(schema.integrationHealth)
    .set({
      status: computedStatus,
      lastSeenAt: nextLastSeenAt,
      lastSuccessAt: nextLastSuccessAt,
      lastFailureAt: nextLastFailureAt,
      errorCount1h: nextErrorCount1h,
      successCount1h: nextSuccessCount1h,
      duplicateCount1h: nextDuplicateCount1h,
      p99LatencyMs1h: nextP99 ?? null,
      consecutiveFailures: nextConsecutiveFailures,
      updatedAt: now,
    })
    .where(eq(schema.integrationHealth.provider, provider))
}

interface StatusInputs {
  lastSuccessAt: Date | null
  consecutiveFailures: number
  errorCount1h: number
  successCount1h: number
  now: Date
}

export function computeStatus(input: StatusInputs): 'green' | 'yellow' | 'red' {
  if (input.consecutiveFailures >= RED_CONSECUTIVE_FAILURES) return 'red'

  if (input.lastSuccessAt == null) {
    return input.errorCount1h > 0 ? 'yellow' : 'green'
  }

  const ageMs = input.now.getTime() - input.lastSuccessAt.getTime()
  if (ageMs > RED_AGE_MS) return 'red'

  const total = input.errorCount1h + input.successCount1h
  const errorRate = total === 0 ? 0 : input.errorCount1h / total

  if (errorRate > RED_ERROR_RATE) return 'red'
  if (ageMs > YELLOW_AGE_MS || errorRate > YELLOW_ERROR_RATE) return 'yellow'
  return 'green'
}

/** Read the current health row for a provider — null when never seen. */
export async function getIntegrationHealth(
  db: DbExecutor,
  provider: WebhookProvider,
): Promise<{
  status: 'green' | 'yellow' | 'red'
  lastSeenAt: Date | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  errorCount1h: number
  consecutiveFailures: number
  p99LatencyMs1h: number | null
} | null> {
  const rows = await db
    .select()
    .from(schema.integrationHealth)
    .where(eq(schema.integrationHealth.provider, provider))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    status: row.status as 'green' | 'yellow' | 'red',
    lastSeenAt: row.lastSeenAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    errorCount1h: row.errorCount1h ?? 0,
    consecutiveFailures: row.consecutiveFailures ?? 0,
    p99LatencyMs1h: row.p99LatencyMs1h,
  }
}

/** Reset hourly counters — called by the prompt 12 stats roll-up cron. */
export async function resetHourlyCounters(db: DbExecutor): Promise<void> {
  await db.update(schema.integrationHealth).set({
    errorCount1h: 0,
    successCount1h: 0,
    duplicateCount1h: 0,
    p99LatencyMs1h: null,
    updatedAt: sql`now()`,
  })
}
