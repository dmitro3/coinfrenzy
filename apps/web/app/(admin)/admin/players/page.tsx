import Link from 'next/link'

import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'

import { fetchPlayersList, type PlayersListFilters } from './_data'
import { PlayersListClient, type PlayerRowJson } from './players-list-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PlayersPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/players')

  const sp = await searchParams
  const filters = parseFilters(sp)
  const { rows, totalCount, filteredCount } = await fetchPlayersList(filters)

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title="Players"
        subtitle={`${totalCount.toLocaleString()} total`}
        breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Players' }]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={<ExportCsvButton href="/api/admin/players/export" />}
      />

      <PlayersListClient
        initialRows={rows.map(serialize)}
        totalCount={totalCount}
        filteredCount={filteredCount}
      />
    </div>
  )
}

function parseFilters(sp: Record<string, string | string[] | undefined>): PlayersListFilters {
  const single = (key: string): string | undefined => {
    const v = sp[key]
    return typeof v === 'string' ? v : undefined
  }
  const status = single('status') as PlayersListFilters['status'] | undefined
  const kycLevel = single('kyc') as PlayersListFilters['kycLevel'] | undefined
  const quickFilter = single('quick') as PlayersListFilters['quickFilter'] | undefined
  return {
    search: single('q'),
    status: status ?? 'all',
    kycLevel: kycLevel ?? 'all',
    state: single('state') ?? 'all',
    quickFilter: quickFilter ?? 'all',
  }
}

function serialize(r: Awaited<ReturnType<typeof fetchPlayersList>>['rows'][number]): PlayerRowJson {
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    displayName: r.displayName,
    state: r.state,
    status: r.status,
    kycLevel: r.kycLevel,
    scBalance: r.scBalance.toString(),
    gcBalance: r.gcBalance.toString(),
    lifetimeSpendUsd: r.lifetimeSpendUsd.toString(),
    lifetimeRedeemedUsd: r.lifetimeRedeemedUsd.toString(),
    netPositionUsd: r.netPositionUsd.toString(),
    purchaseCount: r.purchaseCount,
    redemptionCount: r.redemptionCount,
    totalWageredSc: r.totalWageredSc.toString(),
    roundCount: r.roundCount,
    sessionCount: r.sessionCount,
    daysActive: r.daysActive,
    lastSeenAt: r.lastSeenAt,
    lastPurchaseAt: r.lastPurchaseAt,
  }
}
