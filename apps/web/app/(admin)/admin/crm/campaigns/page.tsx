import Link from 'next/link'
import { Megaphone } from 'lucide-react'

import { EmptyState, StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { fetchCampaignInsights, listCampaignsForAdmin, type CampaignListRow } from '../_data'
import { CampaignRowActions } from './_row-actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_TONE: Record<string, StatusPillTone> = {
  draft: 'neutral',
  scheduled: 'notice',
  sending: 'attention',
  sent: 'positive',
  cancelled: 'critical',
  paused: 'neutral',
}

const STATUS_OPTIONS = ['all', 'draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled']
const CHANNEL_OPTIONS = ['all', 'email', 'sms', 'in_app']

interface PageProps {
  searchParams: Promise<{ search?: string; status?: string; channel?: string }>
}

export default async function CampaignsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filters = {
    search: sp.search?.trim() || undefined,
    status: sp.status,
    channel: sp.channel,
  }
  const [campaigns, insights] = await Promise.all([
    listCampaignsForAdmin(filters),
    fetchCampaignInsights(),
  ])
  const hasFilters = !!(
    filters.search ||
    (filters.status && filters.status !== 'all') ||
    (filters.channel && filters.channel !== 'all')
  )

  return (
    <ListPageShell
      title="Campaigns"
      subtitle={`${campaigns.length.toLocaleString()} loaded`}
      description="One-shot sends to a segment via email, SMS, or in-app notification."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Campaigns' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <Button asChild>
          <Link href="/admin/crm/campaigns/new">+ New campaign</Link>
        </Button>
      }
      insights={[
        { label: 'Sent today', value: insights.sentToday.toLocaleString(), tone: 'positive' },
        {
          label: 'Recipients today',
          value: insights.recipientsToday.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Open rate (7d)',
          value: `${insights.openRate7d.toFixed(1)}%`,
          tone: insights.openRate7d > 20 ? 'positive' : 'neutral',
        },
        {
          label: 'Click rate (7d)',
          value: `${insights.clickRate7d.toFixed(1)}%`,
          tone: insights.clickRate7d > 3 ? 'positive' : 'neutral',
        },
      ]}
    >
      <form
        method="get"
        className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Search name / description</div>
          <input
            name="search"
            defaultValue={filters.search ?? ''}
            placeholder="campaign name…"
            className="h-9 w-[260px] rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          />
        </label>
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Status</div>
          <select
            name="status"
            defaultValue={filters.status ?? 'all'}
            className="h-9 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Channel</div>
          <select
            name="channel"
            defaultValue={filters.channel ?? 'all'}
            className="h-9 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/admin/crm/campaigns"
            className="h-9 rounded-md border border-line-subtle px-4 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            Reset
          </Link>
        ) : null}
      </form>

      <Card>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              title={hasFilters ? 'No campaigns match these filters' : 'No campaigns yet'}
              description={
                hasFilters
                  ? 'Try resetting the filters above.'
                  : 'Create one to send to a segment of players.'
              }
              action={
                hasFilters ? undefined : (
                  <Button asChild>
                    <Link href="/admin/crm/campaigns/new">Create campaign</Link>
                  </Button>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Channel</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Scheduled / sent</th>
                  <th className="px-4 py-2 text-right">Sent</th>
                  <th className="px-4 py-2 text-right">Opened</th>
                  <th className="px-4 py-2 text-right">Clicked</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <CampaignRow key={c.id} campaign={c} tone={STATUS_TONE[c.status] ?? 'neutral'} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}

function CampaignRow({ campaign, tone }: { campaign: CampaignListRow; tone: StatusPillTone }) {
  return (
    <tr className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover">
      <td className="px-4 py-3">
        <Link
          href={`/admin/crm/campaigns/${campaign.id}`}
          className="font-medium text-ink-primary hover:underline"
        >
          {campaign.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-xs uppercase tracking-wide text-ink-tertiary">
        {campaign.channel.replace('_', ' ')}
      </td>
      <td className="px-4 py-3">
        <StatusPill status="custom" color={tone} label={campaign.status} />
      </td>
      <td className="px-4 py-3 text-xs text-ink-tertiary">
        {campaign.scheduledFor ? new Date(campaign.scheduledFor).toLocaleString() : '—'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
        {campaign.sentCount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
        {campaign.openedCount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
        {campaign.clickedCount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right">
        <CampaignRowActions campaignId={campaign.id} status={campaign.status} />
      </td>
    </tr>
  )
}
