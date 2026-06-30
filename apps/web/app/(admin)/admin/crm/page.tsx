import Link from 'next/link'
import {
  ArrowUpRight,
  GitBranch,
  Megaphone,
  Sparkles,
  Users,
  Workflow,
  ScrollText,
} from 'lucide-react'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { EventsFeed } from '@coinfrenzy/ui/admin/crm'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { fetchCrmOverview, fetchTopCampaigns } from './_data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const QUICK_ACTIONS = [
  { href: '/admin/crm/segments/new', label: 'New segment', icon: Users },
  { href: '/admin/crm/campaigns/new', label: 'New campaign', icon: Megaphone },
  { href: '/admin/crm/flows/new', label: 'New flow', icon: GitBranch },
  { href: '/admin/crm/library', label: 'Browse library', icon: ScrollText },
] as const

export default async function CrmLandingPage() {
  const [overview, topCampaigns] = await Promise.all([fetchCrmOverview(), fetchTopCampaigns(8)])

  return (
    <ListPageShell
      title="CRM"
      subtitle="Customer engagement command center"
      description="Build segments, ship campaigns, automate flows, and watch results in real time."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'CRM' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/crm/cohorts">Cohorts</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/crm/campaigns/new">+ New campaign</Link>
          </Button>
        </div>
      }
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
          label: 'Unsubscribed (7d)',
          value: overview.unsubscribed7d.toLocaleString(),
          tone: overview.unsubscribed7d > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <div className="space-y-6">
        {/* Quick actions strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center justify-between rounded-lg border border-line-subtle bg-surface px-4 py-3 transition hover:border-accent/40 hover:bg-surface-hover"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-elevated text-ink-secondary group-hover:text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-ink-primary">{a.label}</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-ink-tertiary transition group-hover:text-accent" />
              </Link>
            )
          })}
        </div>

        {/* Live activity + Top campaigns */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-ink-primary">Live activity</h3>
              </div>
              <Link
                href="/admin/crm/events"
                className="text-xs text-ink-tertiary hover:text-accent"
              >
                Open full feed →
              </Link>
            </div>
            <EventsFeed compact limit={12} />
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-ink-primary">Top campaigns (sent)</h3>
                </div>
                <Link
                  href="/admin/crm/performance/campaigns"
                  className="text-xs text-ink-tertiary hover:text-accent"
                >
                  Performance →
                </Link>
              </div>
              {topCampaigns.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-ink-tertiary">
                  No sent campaigns yet — create your first one to see performance here.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                      <th className="px-4 py-2">Campaign</th>
                      <th className="px-4 py-2 text-right">Sent</th>
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
                            {c.channel}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-primary">
                          {c.sentCount.toLocaleString()}
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

        {/* Snapshot tiles */}
        <div className="grid gap-3 sm:grid-cols-3">
          <SnapshotTile
            label="Active flows"
            value={overview.flowsActive.toLocaleString()}
            href="/admin/crm/flows"
          />
          <SnapshotTile
            label="Total segments"
            value={overview.segmentsTotal.toLocaleString()}
            href="/admin/crm/segments"
          />
          <SnapshotTile
            label="Scheduled / sending"
            value={overview.campaignsScheduled.toLocaleString()}
            href="/admin/crm/campaigns?status=scheduled"
          />
        </div>
      </div>
    </ListPageShell>
  )
}

function SnapshotTile({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-lg border border-line-subtle bg-surface px-4 py-3 transition hover:border-accent/40 hover:bg-surface-hover"
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ink-primary">{value}</div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-ink-tertiary transition group-hover:text-accent" />
    </Link>
  )
}
