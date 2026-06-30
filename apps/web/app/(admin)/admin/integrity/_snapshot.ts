import 'server-only'

import { sql } from 'drizzle-orm'

import { getVendorModes, type Vendor } from '@coinfrenzy/config'
import { getDb, schema } from '@coinfrenzy/db'

// docs/05 §8 + docs/12 §5.3 — shared snapshot for the Integrity page (RSC
// initial render) and the SSE stream (live refresh). One source of truth so
// the page on first paint and the page after the first SSE frame look the
// same.

export const VENDORS: Vendor[] = [
  'finix',
  'alea',
  'footprint',
  'radar',
  'sendgrid',
  'twilio',
  'easyscam',
]

export interface IntegrityVendorTile {
  vendor: Vendor
  mode: 'mock' | 'real'
  status: 'green' | 'yellow' | 'red' | 'unknown'
  lastSeenAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  errorCount1h: number
  successCount1h: number
  duplicateCount1h: number
  p99LatencyMs1h: number | null
  consecutiveFailures: number
}

export interface IntegrityWebhookQueueBucket {
  provider: string
  status: 'received' | 'processing' | 'failed'
  count: number
  oldestReceivedAt: string | null
}

export interface IntegrityFrame {
  ts: string
  vendors: IntegrityVendorTile[]
  pendingWebhooks: {
    total: number
    buckets: IntegrityWebhookQueueBucket[]
  }
  amlReviewQueue: {
    open: number
    oldestOpenedAt: string | null
  }
  aleaReconciliation: {
    openFindings: number
    openCritical: number
    lastRunStartedAt: string | null
  }
}

interface WebhookBucketRow extends Record<string, unknown> {
  provider: string
  status: string
  count: string
  // db.execute() returns plain objects — timestamps may arrive as strings
  oldest_received_at: Date | string | null
}

interface AmlOpenRow extends Record<string, unknown> {
  open: string
  oldest_opened_at: Date | string | null
}

interface AleaFindingsRow extends Record<string, unknown> {
  open: string
  open_critical: string
  last_run_started_at: Date | string | null
}

/**
 * Drizzle's db.execute() returns plain JS objects, not ORM entity instances.
 * Timestamp columns therefore arrive as strings rather than Date objects.
 * This helper safely converts either representation — or null/undefined — to
 * an ISO-8601 string.
 */
function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export async function buildIntegrityFrame(): Promise<IntegrityFrame> {
  const db = getDb()

  const [healthRows, webhookBuckets, [amlRow], [aleaRow]] = await Promise.all([
    db.select().from(schema.integrationHealth),
    db.execute<WebhookBucketRow>(sql`
      SELECT provider,
             status,
             COUNT(*)::text AS count,
             MIN(received_at) AS oldest_received_at
      FROM pending_webhooks
      WHERE status IN ('received', 'processing', 'failed')
      GROUP BY provider, status
      ORDER BY provider, status
    `),
    db.execute<AmlOpenRow>(sql`
      SELECT COUNT(*)::text AS open,
             MIN(created_at) AS oldest_opened_at
      FROM aml_review_queue
      WHERE status = 'open'
    `),
    db.execute<AleaFindingsRow>(sql`
      SELECT COUNT(*)::text AS open,
             COUNT(*) FILTER (WHERE severity = 'critical')::text AS open_critical,
             MAX(run_started_at) AS last_run_started_at
      FROM alea_reconciliation_findings
      WHERE status = 'open'
    `),
  ])

  const modes = getVendorModes()
  const seen = new Map(healthRows.map((r) => [r.provider, r]))

  const vendors: IntegrityVendorTile[] = VENDORS.map((v) => {
    const r = seen.get(v)
    const mode = modes[v]
    if (!r) {
      return {
        vendor: v,
        mode,
        status: 'unknown',
        lastSeenAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        errorCount1h: 0,
        successCount1h: 0,
        duplicateCount1h: 0,
        p99LatencyMs1h: null,
        consecutiveFailures: 0,
      }
    }
    const status: 'green' | 'yellow' | 'red' | 'unknown' = (
      ['green', 'yellow', 'red'] as const
    ).includes(r.status as 'green' | 'yellow' | 'red')
      ? (r.status as 'green' | 'yellow' | 'red')
      : 'unknown'
    return {
      vendor: v,
      mode,
      status,
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
      errorCount1h: r.errorCount1h ?? 0,
      successCount1h: r.successCount1h ?? 0,
      duplicateCount1h: r.duplicateCount1h ?? 0,
      p99LatencyMs1h: r.p99LatencyMs1h,
      consecutiveFailures: r.consecutiveFailures ?? 0,
    }
  })

  const buckets: IntegrityWebhookQueueBucket[] = webhookBuckets
    .filter((b): b is WebhookBucketRow & { status: 'received' | 'processing' | 'failed' } =>
      ['received', 'processing', 'failed'].includes(b.status),
    )
    .map((b) => ({
      provider: b.provider,
      status: b.status,
      count: Number(b.count),
      oldestReceivedAt: toIso(b.oldest_received_at),
    }))

  const total = buckets.reduce((sum, b) => sum + b.count, 0)

  return {
    ts: new Date().toISOString(),
    vendors,
    pendingWebhooks: {
      total,
      buckets,
    },
    amlReviewQueue: {
      open: Number(amlRow?.open ?? 0),
      oldestOpenedAt: toIso(amlRow?.oldest_opened_at),
    },
    aleaReconciliation: {
      openFindings: Number(aleaRow?.open ?? 0),
      openCritical: Number(aleaRow?.open_critical ?? 0),
      lastRunStartedAt: toIso(aleaRow?.last_run_started_at),
    },
  }
}
