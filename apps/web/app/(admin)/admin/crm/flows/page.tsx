import Link from 'next/link'
import { Workflow } from 'lucide-react'

import { crm } from '@coinfrenzy/core'
import { EmptyState, StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { fetchFlowInsights, listFlowsForAdmin } from '../_data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_TONE: Record<string, StatusPillTone> = {
  active: 'positive',
  paused: 'attention',
  archived: 'neutral',
}

const STATUS_OPTIONS = ['all', 'active', 'paused', 'archived']

interface PageProps {
  searchParams: Promise<{ search?: string; status?: string; trigger?: string }>
}

export default async function FlowsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filters = {
    search: sp.search?.trim() || undefined,
    status: sp.status,
    triggerEvent: sp.trigger,
  }
  const [flows, insights] = await Promise.all([listFlowsForAdmin(filters), fetchFlowInsights()])
  const hasFilters = !!(
    filters.search ||
    (filters.status && filters.status !== 'all') ||
    (filters.triggerEvent && filters.triggerEvent !== 'all')
  )
  const triggers = crm.getTriggerEvents()

  return (
    <ListPageShell
      title="Flows"
      subtitle={`${flows.length.toLocaleString()} loaded`}
      description="Automated multi-step journeys triggered by events. Visual node-graph builder with live enrollment counts."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Flows' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <Button asChild>
          <Link href="/admin/crm/flows/new">+ New flow</Link>
        </Button>
      }
      insights={[
        { label: 'Active flows', value: insights.active.toLocaleString(), tone: 'positive' },
        { label: 'Players enrolled', value: insights.enrolled.toLocaleString(), tone: 'neutral' },
        {
          label: 'Completed (24h)',
          value: insights.completed24h.toLocaleString(),
          tone: 'positive',
        },
        {
          label: 'Top flow',
          value: insights.topFlow ? insights.topFlow.name : '—',
          delta: insights.topFlow
            ? `${insights.topFlow.count.toLocaleString()} lifetime`
            : undefined,
          tone: 'neutral',
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
            placeholder="flow name / description…"
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
          <div className="text-ink-tertiary">Trigger event</div>
          <select
            name="trigger"
            defaultValue={filters.triggerEvent ?? 'all'}
            className="h-9 w-[260px] rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            <option value="all">all</option>
            {triggers.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
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
            href="/admin/crm/flows"
            className="h-9 rounded-md border border-line-subtle px-4 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            Reset
          </Link>
        ) : null}
      </form>

      <Card>
        <CardContent className="p-0">
          {flows.length === 0 ? (
            <EmptyState
              icon={<Workflow />}
              title={hasFilters ? 'No flows match these filters' : 'No flows yet'}
              description={
                hasFilters
                  ? 'Try resetting the filters above.'
                  : 'Start from a recipe or build one from scratch.'
              }
              action={
                hasFilters ? undefined : (
                  <Button asChild>
                    <Link href="/admin/crm/flows/new">Create flow</Link>
                  </Button>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Trigger event</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Active enrolments</th>
                  <th className="px-4 py-2 text-right">Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/flows/${f.id}`}
                        className="font-medium text-ink-primary hover:underline"
                      >
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-secondary">
                      {f.triggerEvent}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status="custom"
                        color={STATUS_TONE[f.status] ?? 'neutral'}
                        label={f.status}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                      {f.active.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                      {f.enrollmentsCountLifetime.toLocaleString()}
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
