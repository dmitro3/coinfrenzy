import { and, eq, lte, sql } from 'drizzle-orm'

import type { DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// docs/12 §10 — scheduled report subscriptions. The worker picks up rows
// where `next_due_at <= now()` every minute, generates the report, emails
// it, then advances `next_due_at` to the next slot.

export type ReportKind =
  | 'daily_summary'
  | 'weekly_summary'
  | 'monthly_summary'
  | 'custom_query'
  | 'affiliate_payout_due'

export interface CreateSubscriptionInput {
  adminId: string
  reportKind: ReportKind
  schedule: string // cron string
  emailTo: string[]
  emailSubject?: string
  querySpec?: unknown
  /** Optional override; otherwise computed from `schedule`. */
  nextDueAt?: Date
}

export async function createReportSubscription(
  db: DbExecutor,
  input: CreateSubscriptionInput,
): Promise<{ id: string }> {
  const next = input.nextDueAt ?? estimateNextDue(input.schedule)
  const [row] = await db
    .insert(schema.reportSubscriptions)
    .values({
      adminId: input.adminId,
      reportKind: input.reportKind,
      schedule: input.schedule,
      emailTo: input.emailTo,
      emailSubject: input.emailSubject ?? null,
      querySpec: (input.querySpec as object | undefined) ?? null,
      nextDueAt: next,
      enabled: true,
    })
    .returning({ id: schema.reportSubscriptions.id })
  return { id: row!.id }
}

export interface DueSubscription {
  id: string
  adminId: string
  reportKind: ReportKind
  schedule: string
  emailTo: string[]
  emailSubject: string | null
  querySpec: unknown
}

/** Fetch up to `limit` due subscriptions, ordered oldest-due first. */
export async function fetchDueSubscriptions(
  db: DbExecutor,
  limit = 50,
): Promise<DueSubscription[]> {
  const rows = await db
    .select({
      id: schema.reportSubscriptions.id,
      adminId: schema.reportSubscriptions.adminId,
      reportKind: schema.reportSubscriptions.reportKind,
      schedule: schema.reportSubscriptions.schedule,
      emailTo: schema.reportSubscriptions.emailTo,
      emailSubject: schema.reportSubscriptions.emailSubject,
      querySpec: schema.reportSubscriptions.querySpec,
      nextDueAt: schema.reportSubscriptions.nextDueAt,
    })
    .from(schema.reportSubscriptions)
    .where(
      and(
        eq(schema.reportSubscriptions.enabled, true),
        lte(schema.reportSubscriptions.nextDueAt, new Date()),
      ),
    )
    .orderBy(schema.reportSubscriptions.nextDueAt)
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    adminId: r.adminId,
    reportKind: r.reportKind as ReportKind,
    schedule: r.schedule,
    emailTo: r.emailTo,
    emailSubject: r.emailSubject,
    querySpec: r.querySpec,
  }))
}

export async function markSubscriptionSent(
  db: DbExecutor,
  id: string,
  nextDueAt: Date,
): Promise<void> {
  await db
    .update(schema.reportSubscriptions)
    .set({ lastSentAt: new Date(), nextDueAt })
    .where(eq(schema.reportSubscriptions.id, id))
}

export async function disableSubscription(db: DbExecutor, id: string): Promise<void> {
  await db
    .update(schema.reportSubscriptions)
    .set({ enabled: false })
    .where(eq(schema.reportSubscriptions.id, id))
}

/**
 * Compute the next due-at for a cron expression. Inngest does the real cron
 * scheduling for our CRON-driven jobs; here we only need a coarse estimate
 * for subscription rows so the worker can pick them up.
 *
 * Supported (the only forms the UI generates):
 *   - "0 9 * * *"     daily at 09:00 UTC
 *   - "0 9 * * MON"   weekly on Monday at 09:00 UTC
 *   - "0 9 1 * *"     monthly on the 1st at 09:00 UTC
 *   - "*\/15 * * * *" every 15 minutes
 *
 * Falls back to "tomorrow same time" so we never get stuck. Production
 * deployments can swap this for `cron-parser` if more precision is needed.
 */
export function estimateNextDue(cron: string, now: Date = new Date()): Date {
  const [minute, hour, dom, , dow] = cron.trim().split(/\s+/)
  const next = new Date(now)
  next.setUTCSeconds(0, 0)

  if (minute && /^\*\/(\d+)$/.test(minute)) {
    const step = Number(/\*\/(\d+)/.exec(minute)![1])
    next.setUTCMinutes(next.getUTCMinutes() + step)
    return next
  }

  if (minute) {
    const m = Number(minute)
    if (Number.isFinite(m)) next.setUTCMinutes(m)
  }
  if (hour && hour !== '*') {
    const h = Number(hour)
    if (Number.isFinite(h)) next.setUTCHours(h)
  }
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  if (dom && dom !== '*' && Number.isFinite(Number(dom))) {
    const target = Number(dom)
    while (next.getUTCDate() !== target) {
      next.setUTCDate(next.getUTCDate() + 1)
    }
  } else if (dow && dow !== '*') {
    const targetDow = parseDow(dow)
    if (targetDow !== null) {
      while (next.getUTCDay() !== targetDow) {
        next.setUTCDate(next.getUTCDate() + 1)
      }
    }
  }
  return next
}

function parseDow(s: string): number | null {
  const map: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  }
  if (s in map) return map[s]!
  const n = Number(s)
  if (Number.isFinite(n) && n >= 0 && n <= 6) return n
  return null
}

/**
 * Mark a subscription row as held (workers should skip) by advancing
 * `next_due_at` 60s into the future. Used to stop a stampede when the worker
 * picks up rows but emails fail; on the next cycle we'll retry.
 */
export async function deferSubscription(db: DbExecutor, id: string, seconds = 60): Promise<void> {
  await db
    .update(schema.reportSubscriptions)
    .set({
      nextDueAt: sql`now() + (${seconds}::int * INTERVAL '1 second')`,
    })
    .where(eq(schema.reportSubscriptions.id, id))
}
