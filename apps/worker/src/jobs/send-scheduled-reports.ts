import { eq, sql } from 'drizzle-orm'

import { adapters, reports } from '@coinfrenzy/core'
import * as schema from '@coinfrenzy/db/schema'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/12 §10 — picks up due `report_subscriptions` every minute, generates
// the report payload, emails it, advances `next_due_at`. Subscriptions
// arrive into report_subscriptions via the admin "Schedule report" UI.

const BATCH_SIZE = 25

export const sendScheduledReports = inngest.createFunction(
  {
    id: 'send-scheduled-reports',
    name: 'Send subscribed reports',
    concurrency: { limit: 1 }, // single-flight; the cron is fast
  },
  { cron: '* * * * *' },
  async ({ step }) => {
    return step.run('dispatch', async () => {
      const { ctx } = buildWorkerContext({ loggerBindings: { job: 'send-scheduled-reports' } })
      const due = await reports.fetchDueSubscriptions(ctx.db, BATCH_SIZE)
      if (due.length === 0) return { processed: 0 }

      let processed = 0
      let failures = 0
      const sendgrid = adapters.sendgrid.getSendGridClient()

      for (const sub of due) {
        try {
          // Snapshot the recipient list and fetch admin display name for the
          // email greeting.
          const [admin] = await ctx.db
            .select({ email: schema.admins.email, name: schema.admins.displayName })
            .from(schema.admins)
            .where(eq(schema.admins.id, sub.adminId))
          if (!admin) {
            await reports.disableSubscription(ctx.db, sub.id)
            continue
          }

          const body = await renderReportBody(ctx.db, sub)
          const subject = sub.emailSubject ?? `CoinFrenzy ${sub.reportKind.replace(/_/g, ' ')}`

          for (const recipient of sub.emailTo) {
            await sendgrid.sendEmail({
              to: recipient,
              subject,
              text: body,
              category: `scheduled-report-${sub.reportKind}`,
            })
          }

          await reports.markSubscriptionSent(ctx.db, sub.id, reports.estimateNextDue(sub.schedule))
          processed++
        } catch (e) {
          failures++
          ctx.logger.warn('scheduled report failed', {
            subscriptionId: sub.id,
            error: e instanceof Error ? e.message : String(e),
          })
          await reports.deferSubscription(ctx.db, sub.id, 300)
        }
      }
      ctx.logger.info('scheduled reports run complete', { processed, failures, due: due.length })
      return { processed, failures }
    })
  },
)

import type { DbExecutor } from '@coinfrenzy/db/client'
import type { DueSubscription } from '@coinfrenzy/core/reports'

async function renderReportBody(db: DbExecutor, sub: DueSubscription): Promise<string> {
  switch (sub.reportKind) {
    case 'daily_summary':
      return renderDailySummary(db)
    case 'weekly_summary':
      return renderWeeklySummary(db)
    case 'monthly_summary':
      return renderMonthlySummary(db)
    case 'custom_query':
      return renderCustom(db, sub.querySpec)
    case 'affiliate_payout_due':
      return renderPayoutsDue(db)
    default:
      return `Report kind ${sub.reportKind} is not yet supported.`
  }
}

async function renderDailySummary(db: DbExecutor): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.dailyOperationalSnapshots)
    .where(eq(schema.dailyOperationalSnapshots.date, reports.yesterday()))
  if (!row) {
    return `No snapshot is available yet for ${reports.yesterday()}. The aggregator may still be running.`
  }
  return [
    `Daily summary for ${row.date}`,
    ``,
    `DAU:                  ${row.dau.toLocaleString()}`,
    `New signups:          ${row.newRegisteredPlayers.toLocaleString()}`,
    `Total purchases (USD): $${formatMoney(row.totalDepositsUsd)}`,
    `Total SC staked:      ${formatMoney(row.totalScStaked)} SC`,
    `GGR (SC):             ${formatMoney(row.totalGgrSc)} SC`,
    `NGR (SC):             ${formatMoney(row.totalNgrSc)} SC`,
    `Bonus awarded:        ${formatMoney(row.bonusTotal)} SC`,
  ].join('\n')
}

async function renderWeeklySummary(db: DbExecutor): Promise<string> {
  const rows = (await db.execute<{
    date: string
    dau: number
    total_ngr_sc: string
    total_deposits_usd: string
  }>(sql`
    SELECT date, dau, total_ngr_sc::text, total_deposits_usd::text
    FROM daily_operational_snapshots
    WHERE date >= current_date - INTERVAL '7 days'
    ORDER BY date DESC
  `)) as unknown as Array<{
    date: string
    dau: number
    total_ngr_sc: string
    total_deposits_usd: string
  }>
  return [
    'Weekly summary (last 7 days)',
    '',
    rows
      .map((r) => `${r.date}  DAU=${r.dau}  NGR=${r.total_ngr_sc}  $${r.total_deposits_usd}`)
      .join('\n'),
  ].join('\n')
}

async function renderMonthlySummary(_db: DbExecutor): Promise<string> {
  return `Monthly summary not yet implemented — ask Claude to extend renderMonthlySummary.`
}

async function renderCustom(db: DbExecutor, spec: unknown): Promise<string> {
  const compiled = reports.compileCustomQuery(spec as reports.QuerySpec)
  if (!compiled.ok) return `Custom query failed to compile: ${compiled.error.code}`
  const result = await reports.runCustomQuery(db, compiled.value)
  if (!result.ok) return `Custom query failed: ${result.error.code}`
  const lines: string[] = [compiled.value.columns.join(',')]
  for (const r of result.value.rows.slice(0, 200)) {
    lines.push(reports.rowToCsvCells(r, compiled.value.columns).join(','))
  }
  if (result.value.rows.length > 200) lines.push(`… ${result.value.rows.length - 200} more rows`)
  return lines.join('\n')
}

async function renderPayoutsDue(db: DbExecutor): Promise<string> {
  const rows = (await db.execute<{ username: string; email: string; pending: string }>(sql`
    SELECT a.username, a.email, a.pending_payout_sc::text AS pending
    FROM affiliates a
    WHERE a.status = 'active' AND a.pending_payout_sc > 0
    ORDER BY a.pending_payout_sc DESC
    LIMIT 50
  `)) as unknown as Array<{ username: string; email: string; pending: string }>
  if (rows.length === 0) return 'No affiliate payouts pending.'
  return [
    'Affiliates with pending payouts',
    '',
    rows.map((r) => `${r.username} <${r.email}>  pending=${r.pending} SC`).join('\n'),
  ].join('\n')
}

function formatMoney(v: bigint): string {
  // bigint minor units (4dp). Trim to 2dp for readability.
  const major = v / 10000n
  const fraction = v % 10000n
  const fractionStr = fraction.toString().padStart(4, '0').slice(0, 2)
  return `${major.toLocaleString()}.${fractionStr}`
}
