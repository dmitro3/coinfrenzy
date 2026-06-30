import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { Send } from 'lucide-react'

import { isHost } from '@coinfrenzy/core/auth'
import { ListPageShell, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

export default async function HostMessagesPage() {
  const session = await requireAdminSession('/admin/messages')
  if (!isHost(session.payload.role)) {
    redirect('/admin/crm/message-log')
  }

  const hostId = session.admin.id
  const db = getDb()

  // All messages sent to players assigned to this host.
  const messages = await db
    .select({
      id: schema.crmMessageLog.id,
      playerId: schema.crmMessageLog.playerId,
      playerEmail: schema.players.email,
      channel: schema.crmMessageLog.channel,
      subject: schema.crmMessageLog.subject,
      bodyPreview: schema.crmMessageLog.bodyPreview,
      status: schema.crmMessageLog.status,
      sentAt: schema.crmMessageLog.sentAt,
    })
    .from(schema.crmMessageLog)
    .innerJoin(schema.players, eq(schema.players.id, schema.crmMessageLog.playerId))
    .where(
      and(
        eq(schema.players.assignedHostId, hostId),
        isNull(schema.players.deletedAt),
        isNotNull(schema.crmMessageLog.sentAt),
      ),
    )
    .orderBy(desc(schema.crmMessageLog.sentAt))
    .limit(200)

  // counts for insights
  const [counts] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      delivered: sql<number>`COUNT(*) FILTER (WHERE ${schema.crmMessageLog.status} IN ('delivered', 'opened', 'clicked'))::int`,
      opened: sql<number>`COUNT(*) FILTER (WHERE ${schema.crmMessageLog.status} IN ('opened', 'clicked'))::int`,
    })
    .from(schema.crmMessageLog)
    .innerJoin(schema.players, eq(schema.players.id, schema.crmMessageLog.playerId))
    .where(and(eq(schema.players.assignedHostId, hostId), isNull(schema.players.deletedAt)))

  return (
    <ListPageShell
      title="Messages"
      subtitle={`${counts?.total ?? 0} messages to your VIPs`}
      breadcrumb={[{ label: 'Host Portal', href: '/admin' }, { label: 'Messages' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Total sent',
          value: (counts?.total ?? 0).toString(),
          icon: <Send />,
          tone: 'neutral',
        },
        {
          label: 'Delivered',
          value: (counts?.delivered ?? 0).toString(),
          tone: 'positive',
        },
        {
          label: 'Opened',
          value: (counts?.opened ?? 0).toString(),
          tone: 'positive',
        },
        {
          label: 'Open rate',
          value:
            (counts?.delivered ?? 0) > 0
              ? `${Math.round(((counts?.opened ?? 0) / (counts?.delivered ?? 1)) * 100)}%`
              : '—',
          tone: 'neutral',
        },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-tertiary">
              No messages sent yet. Open a VIP&apos;s profile and use the &ldquo;Send message&rdquo;
              action.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="px-4 py-3 text-left font-medium">Sent</th>
                    <th className="px-4 py-3 text-left font-medium">Player</th>
                    <th className="px-4 py-3 text-left font-medium">Channel</th>
                    <th className="px-4 py-3 text-left font-medium">Subject</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-line-subtle/40 hover:bg-surface-hover/40"
                    >
                      <td className="px-4 py-3 text-ink-tertiary">
                        {m.sentAt ? new Date(m.sentAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/vips/${m.playerId}`}
                          className="text-ink-primary hover:underline"
                        >
                          {m.playerEmail}
                        </Link>
                      </td>
                      <td className="px-4 py-3 uppercase text-ink-tertiary">{m.channel}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-primary">{m.subject ?? '—'}</p>
                        {m.bodyPreview ? (
                          <p className="truncate text-xs text-ink-tertiary">{m.bodyPreview}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status="custom"
                          label={prettyStatus(m.status)}
                          color={toneFor(m.status)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}

function prettyStatus(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function toneFor(s: string): 'positive' | 'attention' | 'critical' | 'neutral' {
  if (s === 'delivered' || s === 'opened' || s === 'clicked') return 'positive'
  if (s === 'bounced' || s === 'failed') return 'critical'
  if (s === 'unsubscribed') return 'attention'
  return 'neutral'
}
