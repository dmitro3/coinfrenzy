import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins, formatCompactCoins } from '@/lib/format'

import {
  fetchCasinoActivity,
  fetchCasinoActivityInsights,
  fetchProviderOptions,
  type CasinoActivityFilters,
} from '../_data'
import { CasinoActivityClient } from './casino-activity-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function CasinoTransactionsPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/transactions/casino')
  const sp = await searchParams

  const filters: CasinoActivityFilters = {
    type: (pickFirst(sp.type) as CasinoActivityFilters['type']) ?? 'all',
    currency: (pickFirst(sp.currency) as CasinoActivityFilters['currency']) ?? 'all',
    quick: (pickFirst(sp.quick) as CasinoActivityFilters['quick']) ?? '7d',
    from: pickFirst(sp.from),
    to: pickFirst(sp.to),
    providerSlug: pickFirst(sp.provider) ?? 'all',
    minAmount: pickFirst(sp.min),
    maxAmount: pickFirst(sp.max),
  }

  const [rows, insights, providers] = await Promise.all([
    fetchCasinoActivity(filters),
    fetchCasinoActivityInsights(filters),
    fetchProviderOptions(),
  ])

  return (
    <ListPageShell
      title="Casino Activity"
      subtitle={`${rows.length.toLocaleString()} events loaded`}
      description="Every bet and win posted to the ledger. Filter by time, type, currency, provider, or amount; search by player or game."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Transactions' },
        { label: 'Casino Activity' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Bets',
          value: insights.betEvents.toLocaleString(),
          delta: `${formatCompactCoins(insights.scWagered)} SC wagered`,
          tone: 'neutral',
        },
        {
          label: 'Wins',
          value: insights.winEvents.toLocaleString(),
          delta: `${formatCompactCoins(insights.scWon)} SC paid out`,
          tone: 'positive',
        },
        {
          label: 'GGR (SC)',
          value: `${formatCompactCoins(insights.ggrSc)}`,
          delta: insights.rtpPct !== null ? `${insights.rtpPct.toFixed(1)}% RTP` : 'no SC plays',
          tone: insights.ggrSc >= 0n ? 'positive' : 'critical',
        },
        {
          label: 'GC wagered',
          value: formatCompactCoins(insights.gcWagered),
          delta: `${formatCoins(insights.gcWon)} GC paid out`,
          tone: 'neutral',
        },
        {
          label: 'Unique players',
          value: insights.uniquePlayers.toLocaleString(),
          tone: 'neutral',
        },
      ]}
    >
      <CasinoActivityClient
        rows={rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          source: r.source,
          amount: r.amount.toString(),
          currency: r.currency,
          playerId: r.playerId,
          playerEmail: r.playerEmail,
          gameId: r.gameId,
          gameName: r.gameName,
          providerSlug: r.providerSlug,
          providerName: r.providerName,
          roundId: r.roundId,
          pairId: r.pairId,
        }))}
        providers={providers}
        initialFilters={{
          type: filters.type ?? 'all',
          currency: filters.currency ?? 'all',
          quick: filters.quick ?? '7d',
          provider: filters.providerSlug ?? 'all',
          min: filters.minAmount ?? '',
          max: filters.maxAmount ?? '',
        }}
      />
    </ListPageShell>
  )
}
