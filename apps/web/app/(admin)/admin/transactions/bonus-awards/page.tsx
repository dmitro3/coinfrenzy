import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { fetchBonusAwardInsights, fetchBonusAwards } from '../_data'
import { BonusAwardsClient } from './bonus-awards-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function BonusAwardsPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/transactions/bonus-awards')
  const sp = await searchParams
  const status = pickFirst(sp.status) ?? 'all'
  const bonusType = pickFirst(sp.type) ?? 'all'
  const quick = pickFirst(sp.quick) ?? 'all'
  const from = pickFirst(sp.from) ?? ''
  const to = pickFirst(sp.to) ?? ''
  const minSc = pickFirst(sp.min) ?? ''
  const maxSc = pickFirst(sp.max) ?? ''

  const [rows, insights] = await Promise.all([
    fetchBonusAwards({
      status,
      bonusType,
      quick: quick as Parameters<typeof fetchBonusAwards>[0]['quick'],
      from,
      to,
      minSc,
      maxSc,
    }),
    fetchBonusAwardInsights(),
  ])

  return (
    <ListPageShell
      title="Bonus awards"
      subtitle={`${rows.length.toLocaleString()} loaded`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Transactions' },
        { label: 'Bonus awards' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Awarded today', value: insights.todayCount.toLocaleString(), tone: 'neutral' },
        {
          label: 'SC awarded today',
          value: `${formatCoins(insights.todayScAwarded.toString())} SC`,
          tone: 'positive',
        },
        {
          label: 'Most common type',
          value: insights.topType.replace(/_/g, ' '),
          tone: 'neutral',
        },
        {
          label: 'Playthrough completion',
          value: `${insights.completedRate.toFixed(1)}%`,
          tone: insights.completedRate > 30 ? 'positive' : 'attention',
        },
      ]}
    >
      <BonusAwardsClient
        rows={rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          playerId: r.playerId,
          playerEmail: r.playerEmail,
          bonusName: r.bonusName,
          bonusType: r.bonusType,
          scAmount: r.scAmount.toString(),
          gcAmount: r.gcAmount.toString(),
          playthroughRequired: r.playthroughRequired.toString(),
          playthroughProgress: r.playthroughProgress.toString(),
          status: r.status,
        }))}
        initialStatus={status}
        initialType={bonusType}
        initialQuick={quick}
        initialFrom={from}
        initialTo={to}
        initialMin={minSc}
        initialMax={maxSc}
      />
    </ListPageShell>
  )
}
