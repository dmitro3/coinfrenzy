import 'server-only'

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { sql } from 'drizzle-orm'

import { emailCenter, noopLogger } from '@coinfrenzy/core'
import { canOverrideSuppression, canSendOneOffEmail } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'

import { EmailCenterClient } from './_client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    search?: string
    status?: string
    since?: string
    until?: string
    compose?: '1'
    open?: string
  }>
}

const STATUS_OPTIONS = [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'spam',
  'unsubscribed',
  'failed',
]

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/email-center')
  const role = session.payload.role
  const sp = await searchParams

  const filters = {
    search: sp.search?.trim() || undefined,
    status: sp.status && sp.status !== 'all' ? sp.status : ('all' as const),
    since: parseDateOnly(sp.since),
    until: parseDateOnly(sp.until, /* endOfDay */ true),
  }

  const db = getDb()
  const ctx = {
    db,
    logger: noopLogger,
    actor: { kind: 'admin' as const, adminId: session.admin.id, role, ip: '' },
    reqId: 'email-center-list',
    afterCommit: () => {},
  }

  const [aggRows, inbox] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM crm_message_log
          WHERE channel = 'email' AND created_at::date = current_date) AS sent_today,
        (SELECT count(*)::int FROM crm_message_log
          WHERE channel = 'email' AND opened_at IS NOT NULL AND created_at::date = current_date) AS opened_today,
        (SELECT count(*)::int FROM crm_message_log
          WHERE channel = 'email' AND clicked_at IS NOT NULL AND created_at::date = current_date) AS clicked_today,
        (SELECT count(*)::int FROM crm_message_log
          WHERE channel = 'email' AND status = 'bounced' AND created_at::date = current_date) AS bounced_today,
        (SELECT count(*)::int FROM crm_message_log
          WHERE channel = 'email' AND status = 'failed' AND created_at::date = current_date) AS failed_today,
        (SELECT count(*)::int FROM crm_campaigns WHERE status = 'sending') AS sending_now,
        (SELECT count(*)::int FROM crm_message_log
          WHERE channel = 'email' AND created_at >= now() - interval '7 days') AS sent_7d
    `),
    emailCenter.listInbox(ctx as never, {
      ...filters,
      limit: 200,
    }),
  ])

  const agg = (aggRows as unknown as Array<Record<string, number>>)[0] ?? {}
  const sentToday = Number(agg.sent_today ?? 0)
  const openedToday = Number(agg.opened_today ?? 0)
  const clickedToday = Number(agg.clicked_today ?? 0)
  const bouncedToday = Number(agg.bounced_today ?? 0)
  const failedToday = Number(agg.failed_today ?? 0)
  const sendingNow = Number(agg.sending_now ?? 0)
  const sent7d = Number(agg.sent_7d ?? 0)

  const openRate = sentToday > 0 ? (openedToday / sentToday) * 100 : 0
  const clickRate = sentToday > 0 ? (clickedToday / sentToday) * 100 : 0
  const bounceRate = sentToday > 0 ? (bouncedToday / sentToday) * 100 : 0

  const canCompose = canSendOneOffEmail(role)
  const canIgnoreSuppression = canOverrideSuppression(role)

  return (
    <ListPageShell
      title="Email Center"
      subtitle={`${inbox.length.toLocaleString()} recent · ${sent7d.toLocaleString()} sent last 7d`}
      description="Outbound email archive plus one-off send. Bulk campaigns live under CRM."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Email Center' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/email-center/suppression"
            className="rounded-md border border-line-subtle px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            Suppression list
          </Link>
          <EmailCenterClient.ComposeTrigger
            canCompose={canCompose}
            canIgnoreSuppression={canIgnoreSuppression}
            defaultOpen={sp.compose === '1'}
          />
        </div>
      }
      insights={[
        { label: 'Sent today', value: sentToday.toLocaleString(), tone: 'neutral' },
        {
          label: 'Open rate today',
          value: `${openRate.toFixed(1)}%`,
          tone: openRate >= 20 ? 'positive' : openRate >= 10 ? 'neutral' : 'attention',
        },
        {
          label: 'Click rate today',
          value: `${clickRate.toFixed(1)}%`,
          tone: clickRate >= 3 ? 'positive' : 'neutral',
        },
        {
          label: 'Bounce rate today',
          value: `${bounceRate.toFixed(1)}%`,
          tone: bounceRate >= 5 ? 'attention' : 'neutral',
        },
        {
          label: 'Bounces today',
          value: bouncedToday.toLocaleString(),
          tone: bouncedToday > 0 ? 'attention' : 'neutral',
        },
        {
          label: 'Failed today',
          value: failedToday.toLocaleString(),
          tone: failedToday > 0 ? 'critical' : 'neutral',
        },
        {
          label: 'Sending now',
          value: sendingNow.toLocaleString(),
          tone: sendingNow > 0 ? 'notice' : 'neutral',
        },
        { label: 'Sent 7d', value: sent7d.toLocaleString(), tone: 'neutral' },
      ]}
    >
      <Card>
        <CardContent className="p-3">
          <form className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1 space-y-1">
              <label
                className="text-xs font-medium text-ink-secondary"
                htmlFor="email-center-search"
              >
                Search
              </label>
              <input
                id="email-center-search"
                name="search"
                defaultValue={filters.search ?? ''}
                placeholder="Recipient or subject…"
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              />
            </div>
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-ink-secondary"
                htmlFor="email-center-status"
              >
                Status
              </label>
              <select
                id="email-center-status"
                name="status"
                defaultValue={sp.status ?? 'all'}
                className="h-9 rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="all">All</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-ink-secondary"
                htmlFor="email-center-since"
              >
                From
              </label>
              <input
                id="email-center-since"
                name="since"
                type="date"
                defaultValue={sp.since ?? ''}
                className="h-9 rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              />
            </div>
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-ink-secondary"
                htmlFor="email-center-until"
              >
                To
              </label>
              <input
                id="email-center-until"
                name="until"
                type="date"
                defaultValue={sp.until ?? ''}
                className="h-9 rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              />
            </div>
            <EmailCenterClient.FilterActions
              hasFilters={Boolean(
                filters.search || filters.status !== 'all' || sp.since || sp.until,
              )}
            />
          </form>
        </CardContent>
      </Card>

      {inbox.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Mail />}
              title="No emails match these filters"
              description="Adjust filters above or compose a new email."
            />
          </CardContent>
        </Card>
      ) : (
        <EmailCenterClient.Inbox
          rows={inbox.map((r) => ({
            id: r.id,
            recipient: r.recipient,
            subject: r.subject,
            status: r.status,
            createdAtIso: r.createdAt.toISOString(),
            sentAtIso: r.sentAt?.toISOString() ?? null,
            openedAtIso: r.openedAt?.toISOString() ?? null,
            clickedAtIso: r.clickedAt?.toISOString() ?? null,
            campaignId: r.campaignId,
            templateId: r.templateId,
          }))}
          openIdInitial={sp.open ?? null}
        />
      )}
    </ListPageShell>
  )
}

function parseDateOnly(s: string | undefined, endOfDay = false): Date | undefined {
  if (!s) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return endOfDay ? new Date(y, mo, d, 23, 59, 59, 999) : new Date(y, mo, d, 0, 0, 0, 0)
}
