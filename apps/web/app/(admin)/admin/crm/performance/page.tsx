import Link from 'next/link'
import { ArrowUpRight, BarChart3, Inbox, Megaphone, Workflow } from 'lucide-react'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { EventsFeed } from '@coinfrenzy/ui/admin/crm'

import { fetchCrmOverview, fetchTopCampaigns } from '../_data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SECTIONS = [
  {
    href: '/admin/crm/performance/campaigns',
    label: 'Campaigns',
    description: 'Funnels, retention, A/B winners',
    icon: Megaphone,
  },
  {
    href: '/admin/crm/performance/channels',
    label: 'Channels',
    description: 'Email vs SMS vs Push vs In-app',
    icon: BarChart3,
  },
  {
    href: '/admin/crm/performance/suppression',
    label: 'Suppression',
    description: 'Bounce, unsub, complaints, trends',
    icon: Inbox,
  },
] as const

export default async function Page() {
  const [overview, topCampaigns] = await Promise.all([fetchCrmOverview(), fetchTopCampaigns(10)])

  return (
    <ListPageShell
      title="Performance"
      subtitle="Last 7 days"
      description="High-level CRM performance. Drill into channels, campaigns, or suppression analytics for the full picture."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Performance' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Sent today', value: overview.sentToday.toLocaleString(), tone: 'positive' },
        {
          label: 'Open rate (7d)',
          value: `${overview.openRate7d.toFixed(1)}%`,
          tone: overview.openRate7d > 20 ? 'positive' : 'neutral',
        },
        {
          label: 'Click rate (7d)',
          value: `${overview.clickRate7d.toFixed(1)}%`,
          tone: overview.clickRate7d > 3 ? 'positive' : 'neutral',
        },
        {
          label: 'Conversions (7d)',
          value: overview.conversions7d.toLocaleString(),
          tone: 'positive',
        },
        {
          label: 'Unsubs (7d)',
          value: overview.unsubscribed7d.toLocaleString(),
          tone: overview.unsubscribed7d > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-center justify-between rounded-lg border border-line-subtle bg-surface px-4 py-4 transition hover:border-accent/40 hover:bg-surface-hover"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-ink-secondary group-hover:text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{s.label}</div>
                    <div className="text-xs text-ink-tertiary">{s.description}</div>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-ink-tertiary transition group-hover:text-accent" />
              </Link>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-ink-primary">Live activity</h3>
              </div>
              <Link
                href="/admin/crm/events"
                className="text-xs text-ink-tertiary hover:text-accent"
              >
                Open full feed →
              </Link>
            </div>
            <EventsFeed compact limit={15} />
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b border-line-subtle px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-primary">Top performing campaigns</h3>
              </div>
              {topCampaigns.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-ink-tertiary">
                  No sent campaigns yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                      <th className="px-4 py-2">Campaign</th>
                      <th className="px-4 py-2 text-right">Open</th>
                      <th className="px-4 py-2 text-right">Click</th>
                      <th className="px-4 py-2 text-right">Conv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.map((c) => (
                      <tr key={c.id} className="border-t border-line-subtle hover:bg-surface-hover">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/crm/campaigns/${c.id}`}
                            className="font-medium text-ink-primary hover:underline"
                          >
                            {c.name}
                          </Link>
                          <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                            {c.channel} · {c.sentCount.toLocaleString()} sent
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                          {c.openRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                          {c.clickRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-positive">
                          {c.conversionCount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ListPageShell>
  )
}
