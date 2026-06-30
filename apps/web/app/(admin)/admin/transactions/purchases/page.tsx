import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchPurchaseInsights, fetchPurchases } from '../_data'
import { PurchasesListClient } from './purchases-list-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function PurchasesPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/transactions/purchases')
  const sp = await searchParams
  const status = pickFirst(sp.status) ?? 'all'
  const quick = pickFirst(sp.quick) ?? 'all'
  const from = pickFirst(sp.from) ?? ''
  const to = pickFirst(sp.to) ?? ''
  const minUsd = pickFirst(sp.min) ?? ''
  const maxUsd = pickFirst(sp.max) ?? ''

  const [purchases, insights] = await Promise.all([
    fetchPurchases({
      status,
      quick: quick as Parameters<typeof fetchPurchases>[0]['quick'],
      from,
      to,
      minUsd,
      maxUsd,
    }),
    fetchPurchaseInsights(),
  ])

  return (
    <ListPageShell
      title="Purchases"
      subtitle={`${purchases.length.toLocaleString()} loaded`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Transactions' },
        { label: 'Purchases' },
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
          label: 'Avg purchase',
          value: insights.avgPurchaseUsd > 0n ? formatUsd(insights.avgPurchaseUsd.toString()) : '—',
          tone: 'neutral',
        },
        {
          label: 'Failed today',
          value: insights.failedToday.toLocaleString(),
          tone: insights.failedToday > 0 ? 'attention' : 'neutral',
          href: '/admin/transactions/purchases?status=failed',
        },
        {
          label: 'Refunds today',
          value: insights.refundsToday.toLocaleString(),
          tone: insights.refundsToday > 0 ? 'critical' : 'neutral',
          href: '/admin/transactions/purchases?status=refunded',
        },
      ]}
    >
      <PurchasesListClient
        rows={purchases.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          playerEmail: p.playerEmail,
          playerId: p.playerId,
          amountUsd: p.amountUsd.toString(),
          baseGc: p.baseGc.toString(),
          baseSc: p.baseSc.toString(),
          bonusGc: p.bonusGc.toString(),
          bonusSc: p.bonusSc.toString(),
          cardBrand: p.cardBrand,
          cardLast4: p.cardLast4,
          status: p.status,
          packageName: p.packageName,
        }))}
        initialStatus={status}
        initialQuick={quick}
        initialFrom={from}
        initialTo={to}
        initialMin={minUsd}
        initialMax={maxUsd}
      />
    </ListPageShell>
  )
}
