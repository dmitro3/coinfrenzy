import Link from 'next/link'
import { Users } from 'lucide-react'

import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { fetchSegmentInsights, listSegmentsForAdmin } from '../_data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_OPTIONS = ['all', 'active', 'archived']
const USAGE_OPTIONS = [
  { value: 'all', label: 'any usage' },
  { value: 'used', label: 'used somewhere' },
  { value: 'unused', label: 'unused' },
]

interface PageProps {
  searchParams: Promise<{ search?: string; status?: string; usage?: 'used' | 'unused' | 'all' }>
}

export default async function SegmentsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filters = {
    search: sp.search?.trim() || undefined,
    status: sp.status,
    usage: sp.usage === 'used' || sp.usage === 'unused' ? sp.usage : undefined,
  }
  const [segments, insights] = await Promise.all([
    listSegmentsForAdmin(filters),
    fetchSegmentInsights(),
  ])
  const hasFilters = !!(
    filters.search ||
    (filters.status && filters.status !== 'all') ||
    filters.usage
  )

  return (
    <ListPageShell
      title="Segments"
      subtitle={`${segments.length.toLocaleString()} loaded`}
      description="Saved player filters used by campaigns, flows, and banners. Live counts hit cached rollup tables."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Segments' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <Button asChild>
          <Link href="/admin/crm/segments/new">+ New segment</Link>
        </Button>
      }
      insights={[
        { label: 'Total segments', value: insights.total.toLocaleString(), tone: 'neutral' },
        {
          label: 'Largest',
          value: insights.largest ? insights.largest.count.toLocaleString() : '—',
          delta: insights.largest ? insights.largest.name : undefined,
          tone: 'positive',
        },
        {
          label: 'Most used',
          value: insights.mostUsedByCampaigns ? insights.mostUsedByCampaigns.name : '—',
          delta: insights.mostUsedByCampaigns
            ? `${insights.mostUsedByCampaigns.count} campaign${insights.mostUsedByCampaigns.count === 1 ? '' : 's'}`
            : undefined,
          tone: 'neutral',
        },
        {
          label: 'Active in campaigns',
          value: insights.activeCampaignsUsingSegments.toLocaleString(),
          tone: 'notice',
        },
      ]}
    >
      <form
        method="get"
        className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Search</div>
          <input
            name="search"
            defaultValue={filters.search ?? ''}
            placeholder="segment name / description…"
            className="h-9 w-[240px] rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
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
          <div className="text-ink-tertiary">Usage</div>
          <select
            name="usage"
            defaultValue={filters.usage ?? 'all'}
            className="h-9 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            {USAGE_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
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
            href="/admin/crm/segments"
            className="h-9 rounded-md border border-line-subtle px-4 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            Reset
          </Link>
        ) : null}
      </form>

      <Card>
        <CardContent className="p-0">
          {segments.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={hasFilters ? 'No segments match these filters' : 'No segments yet'}
              description={
                hasFilters
                  ? 'Try resetting the filters above.'
                  : 'Create one to get started building campaigns and flows.'
              }
              action={
                hasFilters ? undefined : (
                  <Button asChild>
                    <Link href="/admin/crm/segments/new">Create segment</Link>
                  </Button>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 text-right">Players</th>
                  <th className="px-4 py-2 text-right">Used by</th>
                  <th className="px-4 py-2">Last computed</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/segments/${s.id}`}
                        className="font-medium text-ink-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      {s.description ? (
                        <div className="mt-0.5 truncate text-xs text-ink-tertiary">
                          {s.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                      {s.cachedCount === null ? '—' : s.cachedCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-secondary">
                      {s.campaignsUsing > 0 ? `${s.campaignsUsing} camp` : ''}
                      {s.campaignsUsing > 0 && s.flowsUsing > 0 ? ' · ' : ''}
                      {s.flowsUsing > 0 ? `${s.flowsUsing} flow` : ''}
                      {s.campaignsUsing === 0 && s.flowsUsing === 0 ? (
                        <span className="text-ink-tertiary">unused</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {s.countUpdatedAt ? new Date(s.countUpdatedAt).toLocaleString() : 'never'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status="custom"
                        color={s.status === 'active' ? 'positive' : 'neutral'}
                        label={s.status}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/crm/segments/${s.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
