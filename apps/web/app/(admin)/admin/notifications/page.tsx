import 'server-only'

import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { noopLogger, notificationCenter } from '@coinfrenzy/core'
import { canSendNotification } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'

import { NotificationsClient } from './_client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    q?: string
    priority?: 'all' | 'low' | 'normal' | 'high'
    unread?: '1'
    open?: string
  }>
}

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/notifications')
  const role = session.payload.role
  const sp = await searchParams

  const db = getDb()
  const ctx = {
    db,
    logger: noopLogger,
    actor: { kind: 'anonymous' as const },
    reqId: crypto.randomUUID(),
    afterCommit: () => {},
  }

  const rows = await notificationCenter.listInbox(ctx, {
    search: sp.q,
    priority: sp.priority ?? 'all',
    unreadOnly: sp.unread === '1',
    limit: 200,
  })

  const [agg] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM notifications WHERE created_at::date = current_date) AS sent_today,
      (SELECT count(*)::int FROM notifications WHERE read_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active,
      (SELECT count(*)::int FROM notifications WHERE expires_at IS NOT NULL AND expires_at > now()) AS scheduled,
      (SELECT count(*)::int FROM notifications) AS total,
      (SELECT count(*)::int FROM notifications WHERE read_at IS NOT NULL) AS read_count,
      (SELECT count(*)::int FROM notifications WHERE priority = 'high' AND read_at IS NULL) AS unread_high
  `)) as unknown as Array<{
    sent_today: number
    active: number
    scheduled: number
    total: number
    read_count: number
    unread_high: number
  }>

  const total = agg?.total ?? 0
  const readRate = total > 0 ? ((agg?.read_count ?? 0) / total) * 100 : 0
  const canCompose = canSendNotification(role)

  const initialRows = rows.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    title: r.title,
    body: r.body,
    category: r.category,
    priority: r.priority,
    readAtIso: r.readAt ? r.readAt.toISOString() : null,
    createdAtIso: r.createdAt.toISOString(),
    expiresAtIso: r.expiresAt ? r.expiresAt.toISOString() : null,
  }))

  return (
    <ListPageShell
      title="Notification Center"
      subtitle={`${rows.length.toLocaleString()} recent`}
      description="In-app push to a single player or every active player. Each send is audited."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Notification Center' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<NotificationsClient.ComposeTrigger canCompose={canCompose} />}
      insights={[
        { label: 'Sent today', value: (agg?.sent_today ?? 0).toLocaleString(), tone: 'neutral' },
        {
          label: 'Active',
          value: (agg?.active ?? 0).toLocaleString(),
          tone: (agg?.active ?? 0) > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Read rate',
          value: `${readRate.toFixed(1)}%`,
          tone: readRate > 50 ? 'positive' : 'neutral',
        },
        {
          label: 'Unread high',
          value: (agg?.unread_high ?? 0).toLocaleString(),
          tone: (agg?.unread_high ?? 0) > 0 ? 'notice' : 'neutral',
        },
      ]}
    >
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line-subtle bg-surface px-4 py-3"
      >
        <div className="flex flex-col">
          <label className="text-[10px] uppercase tracking-wide text-ink-tertiary">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Title or body…"
            className="h-8 w-64 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] uppercase tracking-wide text-ink-tertiary">Priority</label>
          <select
            name="priority"
            defaultValue={sp.priority ?? 'all'}
            className="h-8 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === '1'} />
          Unread only
        </label>
        <button
          type="submit"
          className="h-8 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary hover:bg-surface-hover"
        >
          Apply
        </button>
        <Link
          href="/admin/notifications"
          className="text-xs text-ink-tertiary underline-offset-4 hover:underline"
        >
          Reset
        </Link>
      </form>

      <NotificationsClient.Inbox rows={initialRows} openIdInitial={sp.open ?? null} />
    </ListPageShell>
  )
}
