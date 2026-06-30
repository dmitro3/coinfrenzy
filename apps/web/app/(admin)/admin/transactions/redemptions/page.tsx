import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchRedemptionInsights, fetchRedemptionsBroad } from '../_data'
import { RedemptionsListClient } from './redemptions-list-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function RedemptionsPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/transactions/redemptions')
  const sp = await searchParams
  const status = pickFirst(sp.status) ?? 'all'
  const quick = pickFirst(sp.quick) ?? 'all'
  const from = pickFirst(sp.from) ?? ''
  const to = pickFirst(sp.to) ?? ''
  const minUsd = pickFirst(sp.min) ?? ''
  const maxUsd = pickFirst(sp.max) ?? ''
  const kycLevel = pickFirst(sp.kyc) ?? 'all'

  const [rows, insights] = await Promise.all([
    fetchRedemptionsBroad({
      status,
      quick: quick as Parameters<typeof fetchRedemptionsBroad>[0]['quick'],
      from,
      to,
      minUsd,
      maxUsd,
      kycLevel,
    }),
    fetchRedemptionInsights(),
  ])

  return (
    <ListPageShell
      title="Redemptions"
      subtitle={`${rows.length.toLocaleString()} loaded`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Transactions' },
        { label: 'Redemptions' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Today\u2019s volume',
          value: formatUsd(insights.todayVolumeUsd.toString()),
          tone: 'positive',
        },
        {
          label: 'Today\u2019s count',
          value: insights.todayCount.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Pending review',
          value: insights.pendingReview.toLocaleString(),
          tone: insights.pendingReview > 0 ? 'attention' : 'neutral',
          href: '/admin/cashier/pending',
        },
        {
          label: 'Paid today',
          value: insights.paidToday.toLocaleString(),
          tone: 'positive',
        },
        {
          label: 'Avg processing',
          value:
            insights.avgProcessingHours > 0 ? `${insights.avgProcessingHours.toFixed(1)}h` : '—',
          tone: 'neutral',
        },
      ]}
    >
      <RedemptionsListClient
        rows={rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          playerId: r.playerId,
          playerEmail: r.playerEmail,
          amountUsd: r.amountUsd.toString(),
          amountSc: r.amountSc.toString(),
          method: r.method,
          status: r.status,
          paidAt: r.paidAt,
          approvedAt: r.approvedAt,
          kycLevel: r.kycLevel,
        }))}
        initialStatus={status}
        initialQuick={quick}
        initialFrom={from}
        initialTo={to}
        initialMin={minUsd}
        initialMax={maxUsd}
        initialKyc={kycLevel}
      />
    </ListPageShell>
  )
}
