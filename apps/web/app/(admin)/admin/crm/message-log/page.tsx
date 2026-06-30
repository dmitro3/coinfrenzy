import Link from 'next/link'
import { ScrollText } from 'lucide-react'

import { EmptyState, StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { EventsFeed } from '@coinfrenzy/ui/admin/crm'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'

import { fetchMessageLogInsights, listMessageLogForAdmin } from '../_data'
import { MessageLogViewTabs } from './_view-tabs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_TONE: Record<string, StatusPillTone> = {
  sent: 'positive',
  delivered: 'positive',
  opened: 'positive',
  clicked: 'positive',
  bounced: 'critical',
  failed: 'critical',
  spam: 'critical',
  unsubscribed: 'attention',
  queued: 'notice',
}

interface PageProps {
  searchParams: Promise<{ playerId?: string; campaignId?: string; view?: string }>
}

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams
  const view = sp.view === 'feed' ? 'feed' : 'table'
  const [rows, insights] = await Promise.all([
    listMessageLogForAdmin({
      limit: 200,
      playerId: sp.playerId,
      campaignId: sp.campaignId,
    }),
    fetchMessageLogInsights(),
  ])

  const deliveryRate =
    insights.totalToday > 0
      ? (insights.delivered7d / Math.max(insights.delivered7d + insights.bounce7d, 1)) * 100
      : 100
  const bounceRate =
    insights.delivered7d + insights.bounce7d > 0
      ? (insights.bounce7d / (insights.delivered7d + insights.bounce7d)) * 100
      : 0

  return (
    <ListPageShell
      title="Message log"
      subtitle={`${rows.length.toLocaleString()} loaded`}
      description="Outbound emails + SMS, last 200. Filter via search params."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Message log' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Total today', value: insights.totalToday.toLocaleString(), tone: 'neutral' },
        {
          label: 'Delivery rate (7d)',
          value: `${deliveryRate.toFixed(1)}%`,
          tone: deliveryRate > 95 ? 'positive' : 'attention',
        },
        {
          label: 'Bounce rate (7d)',
          value: `${bounceRate.toFixed(2)}%`,
          tone: bounceRate > 2 ? 'critical' : bounceRate > 0 ? 'attention' : 'positive',
        },
        {
          label: 'Unsubscribes (7d)',
          value: insights.unsubscribed7d.toLocaleString(),
          tone: insights.unsubscribed7d > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <MessageLogViewTabs view={view} playerId={sp.playerId} campaignId={sp.campaignId} />

      {view === 'feed' ? (
        <Card>
          <EventsFeed />
        </Card>
      ) : (
        <>
          <form
            method="get"
            className="flex flex-wrap items-end gap-3 rounded-lg border border-line-subtle bg-surface px-4 py-3"
          >
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-ink-tertiary">Player ID</span>
              <Input
                name="playerId"
                defaultValue={sp.playerId ?? ''}
                placeholder="UUID"
                className="h-9 w-[280px] font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-ink-tertiary">Campaign ID</span>
              <Input
                name="campaignId"
                defaultValue={sp.campaignId ?? ''}
                placeholder="UUID"
                className="h-9 w-[280px] font-mono text-xs"
              />
            </label>
            <Button type="submit" size="sm" className="h-9">
              Filter
            </Button>
          </form>

          <Card>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <EmptyState
                  icon={<ScrollText />}
                  title="No messages"
                  description="Once campaigns or flows fire you'll see every outbound message here."
                />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line-subtle text-left font-medium uppercase tracking-wide text-ink-tertiary">
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Channel</th>
                      <th className="px-3 py-2">Recipient</th>
                      <th className="px-3 py-2">Subject / Player</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-line-subtle last:border-b-0 hover:bg-surface-hover"
                      >
                        <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                          {new Date(r.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-1.5 uppercase tracking-wide text-ink-tertiary">
                          {r.channel}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-ink-primary">{r.recipient}</td>
                        <td className="px-3 py-1.5">
                          <div className="line-clamp-1 text-ink-primary">
                            {r.subject ?? <span className="text-ink-tertiary">—</span>}
                          </div>
                          <div className="font-mono text-[10px] text-ink-tertiary">
                            {r.playerId.slice(0, 8)}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <StatusPill
                            status="custom"
                            color={STATUS_TONE[r.status] ?? 'neutral'}
                            label={r.status}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-ink-tertiary">
                          {r.openedAt ? (
                            <div>opened {new Date(r.openedAt).toLocaleTimeString()}</div>
                          ) : null}
                          {r.clickedAt ? (
                            <div>clicked {new Date(r.clickedAt).toLocaleTimeString()}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ListPageShell>
  )
}
