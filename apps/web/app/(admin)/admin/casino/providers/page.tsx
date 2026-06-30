import Link from 'next/link'

import { casino } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'

import { parseWindow } from '../_window-utils'
import { WindowSelector } from '../_window-selector'
import { ProvidersListClient } from './providers-list-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const WINDOW_LABEL: Record<string, string> = {
  '30d': '30d',
  '90d': '90d',
  '180d': '180d',
  '1y': '1y',
  all: 'all time',
}

export default async function ProvidersPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/casino/providers')
  const sp = await searchParams
  const window = parseWindow(sp.window)

  const ctx = buildAdminRscContext()
  const providers = await casino.getProviderStats(ctx, window)

  const totalProviders = providers.length
  const activeProviders = providers.filter((p) => p.status === 'active').length
  const disabledProviders = providers.filter((p) => p.status !== 'active').length

  // Total GGR across all providers in this window — denominator for the
  // per-row share %. We compare bigints so we don't lose precision.
  const totalGgr = providers.reduce((sum, p) => sum + p.ggr, 0n)

  const byGgr = [...providers].sort((a, b) => Number(b.ggr - a.ggr))
  const top1 = byGgr[0]
  const top2 = byGgr[1]
  const top3 = byGgr[2]
  const topByPlays = [...providers].sort((a, b) => b.plays - a.plays)[0]

  return (
    <ListPageShell
      title="Provider Dashboard"
      subtitle={`${totalProviders} integrated`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Casino Management' },
        { label: 'Providers' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<WindowSelector value={window} />}
      insights={[
        { label: 'Total providers', value: totalProviders.toLocaleString(), tone: 'neutral' },
        {
          label: 'Active',
          value: activeProviders.toLocaleString(),
          delta: `${Math.round((activeProviders / Math.max(totalProviders, 1)) * 100)}% of integrations`,
          tone: 'positive',
        },
        {
          label: `#1 by GGR (${WINDOW_LABEL[window]})`,
          value: top1?.displayName ?? '—',
          delta: top1 ? `${formatScCompact(top1.ggr)} SC` : 'no data',
          tone: 'positive',
        },
        {
          label: '#2',
          value: top2?.displayName ?? '—',
          delta: top2 ? `${formatScCompact(top2.ggr)} SC` : 'no data',
          tone: 'neutral',
        },
        {
          label: '#3',
          value: top3?.displayName ?? '—',
          delta: top3 ? `${formatScCompact(top3.ggr)} SC` : 'no data',
          tone: 'neutral',
        },
        {
          label: `Most popular (${WINDOW_LABEL[window]})`,
          value: topByPlays?.displayName ?? '—',
          delta: topByPlays ? `${topByPlays.plays.toLocaleString()} plays` : 'no data',
          tone: 'neutral',
        },
        {
          label: 'Disabled',
          value: disabledProviders.toLocaleString(),
          tone: disabledProviders > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <ProvidersListClient
        rows={providers.map((p, idx) => ({
          id: p.id,
          slug: p.slug,
          displayName: p.displayName,
          status: p.status,
          aggregator: p.aggregator,
          gameCount: p.gameCount,
          plays: p.plays,
          ggrSc: p.ggr.toString(),
          rtpAvg: p.rtpAvg,
          rank: idx, // recomputed client-side after sort
        }))}
        totalGgrSc={totalGgr.toString()}
        windowLabel={WINDOW_LABEL[window]}
      />
    </ListPageShell>
  )
}

function formatScCompact(value: bigint): string {
  const major = Number(value / 10_000n)
  if (Math.abs(major) >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`
  if (Math.abs(major) >= 1_000) return `${(major / 1_000).toFixed(1)}K`
  return major.toLocaleString()
}
