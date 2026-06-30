import Link from 'next/link'

import { casino } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'

import { AggregatorsClient } from './aggregators-client'

export const dynamic = 'force-dynamic'

export default async function AggregatorsPage() {
  const session = await requireAdminSession('/admin/casino/aggregators')
  const ctx = buildAdminRscContext()
  const rows = await casino.listAggregatorsDetailed(ctx)

  const active = rows.filter((r) => r.status === 'active').length
  const totalGames = rows.reduce((sum, r) => sum + r.gameCount, 0)
  const totalGgr = rows.reduce((sum, r) => sum + BigInt(r.ggr30dSc), 0n)
  const healthy = rows.filter((r) => isHealthy(r.lastSeenAt, r.errorCount1h)).length

  return (
    <ListPageShell
      title="Aggregators"
      subtitle="Integration wiring for AleaPlay, Marbles and any future aggregator."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Casino' },
        { label: 'Aggregators' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Total integrations', value: rows.length.toLocaleString(), tone: 'neutral' },
        { label: 'Active', value: active.toLocaleString(), tone: 'positive' },
        {
          label: 'Healthy',
          value: healthy.toLocaleString(),
          tone: healthy === rows.length ? 'positive' : 'attention',
        },
        { label: 'Games provided', value: totalGames.toLocaleString(), tone: 'neutral' },
      ]}
    >
      <AggregatorsClient
        canEdit={session.payload.role === 'master' || session.payload.role === 'manager'}
        aggregators={rows.map((r) => ({
          ...r,
          totalGgr30dSc: r.ggr30dSc,
          healthStatus: classifyHealth(r.lastSeenAt, r.errorCount1h),
        }))}
        totalGgrSc={totalGgr.toString()}
      />
    </ListPageShell>
  )
}

function isHealthy(lastSeenAt: string | null, errorCount1h: number): boolean {
  return classifyHealth(lastSeenAt, errorCount1h) === 'healthy'
}

function classifyHealth(
  lastSeenAt: string | null,
  errorCount1h: number,
): 'healthy' | 'degraded' | 'down' | 'unknown' {
  if (errorCount1h > 25) return 'down'
  if (!lastSeenAt) return 'unknown'
  const ageMs = Date.now() - new Date(lastSeenAt).getTime()
  if (ageMs > 6 * 60 * 60 * 1000) return 'down'
  if (errorCount1h > 5 || ageMs > 30 * 60 * 1000) return 'degraded'
  return 'healthy'
}
