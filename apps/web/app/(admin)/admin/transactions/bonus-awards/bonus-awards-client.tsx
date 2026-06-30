'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Gift } from 'lucide-react'

import {
  DataTable,
  EmptyState,
  FilterBar,
  StatusPill,
  type FilterDropdown,
  type QuickFilter,
} from '@coinfrenzy/ui/admin'

import { formatCoins } from '@/lib/format'

import { TransactionsAdvancedFilters } from '../_advanced-filters'

export interface BonusAwardRowJson {
  id: string
  createdAt: string
  playerId: string
  playerEmail: string
  bonusName: string
  bonusType: string
  scAmount: string
  gcAmount: string
  playthroughRequired: string
  playthroughProgress: string
  status: string
}

interface Props {
  rows: BonusAwardRowJson[]
  initialStatus: string
  initialType: string
  initialQuick: string
  initialFrom: string
  initialTo: string
  initialMin: string
  initialMax: string
}

const BONUS_TYPES = [
  'welcome',
  'tier_up',
  'weekly_tier',
  'monthly_tier',
  'package',
  'daily',
  'jackpot',
  'referral',
  'affiliate',
  'promotion',
  'amoe',
  'admin_added_sc',
  'crm_promocode',
  'purchase_promocode',
]

export function BonusAwardsClient({
  rows,
  initialStatus,
  initialType,
  initialQuick,
  initialFrom,
  initialTo,
  initialMin,
  initialMax,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, startNavigation] = React.useTransition()
  const [search, setSearch] = React.useState('')

  const navigate = React.useCallback(
    (href: string) => {
      startNavigation(() => {
        router.push(href)
      })
    },
    [router],
  )

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value == null || value === '' || value === 'all') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    navigate(qs ? `${pathname}?${qs}` : pathname)
  }

  const filtered = React.useMemo(() => {
    let out = rows
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      out = out.filter(
        (r) =>
          r.playerEmail.toLowerCase().includes(q) ||
          r.bonusName.toLowerCase().includes(q) ||
          r.id.includes(q),
      )
    }
    return out
  }, [rows, search])

  const filters: FilterDropdown[] = [
    {
      key: 'type',
      label: 'Type',
      value: initialType,
      onChange: (v) => update('type', v),
      options: [
        { value: 'all', label: 'All types' },
        ...BONUS_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })),
      ],
    },
    {
      key: 'status',
      label: 'Status',
      value: initialStatus,
      onChange: (v) => update('status', v),
      options: [
        { value: 'all', label: 'All' },
        { value: 'active', label: 'Active (in playthrough)' },
        { value: 'completed', label: 'Completed' },
        { value: 'expired', label: 'Expired' },
        { value: 'forfeited', label: 'Forfeited' },
        { value: 'reversed', label: 'Reversed' },
      ],
    },
  ]

  const quickFilters: QuickFilter[] = [
    {
      label: 'All',
      value: 'all',
      active: initialQuick === 'all',
      onClick: () => update('quick', null),
    },
    {
      label: 'Today',
      value: 'today',
      active: initialQuick === 'today',
      onClick: () => update('quick', 'today'),
    },
    {
      label: '7d',
      value: '7d',
      active: initialQuick === '7d',
      onClick: () => update('quick', '7d'),
    },
    {
      label: '30d',
      value: '30d',
      active: initialQuick === '30d',
      onClick: () => update('quick', '30d'),
    },
    {
      label: '90d',
      value: '90d',
      active: initialQuick === '90d',
      onClick: () => update('quick', '90d'),
    },
  ]

  const columns: ColumnDef<BonusAwardRowJson>[] = [
    {
      id: 'when',
      header: 'When',
      cell: ({ row }) => (
        <span className="text-ink-secondary tabular-nums">
          {new Date(row.original.createdAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'player',
      header: 'Player',
      cell: ({ row }) => (
        <Link
          href={`/admin/players/${row.original.playerId}`}
          className="block min-w-0 truncate text-ink-primary hover:underline"
        >
          {row.original.playerEmail}
        </Link>
      ),
    },
    {
      id: 'bonus',
      header: 'Bonus',
      cell: ({ row }) => (
        <div>
          <div className="text-ink-primary">{row.original.bonusName}</div>
          <div className="text-[11px] text-ink-tertiary">
            {row.original.bonusType.replace(/_/g, ' ')}
          </div>
        </div>
      ),
    },
    {
      id: 'sc',
      header: 'SC',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-primary">{formatCoins(row.original.scAmount)}</span>
      ),
    },
    {
      id: 'gc',
      header: 'GC',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-secondary">
          {formatCoins(row.original.gcAmount)}
        </span>
      ),
    },
    {
      id: 'progress',
      header: 'Playthrough',
      cell: ({ row }) => {
        const required = BigInt(row.original.playthroughRequired)
        const progress = BigInt(row.original.playthroughProgress)
        const pct = required > 0n ? Number((progress * 100n) / required) : 100
        return (
          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-ink-tertiary">{pct}%</div>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        switch (row.original.status) {
          case 'active':
            return <StatusPill status="custom" color="attention" label="In playthrough" />
          case 'completed':
            return <StatusPill status="completed" />
          case 'expired':
            return <StatusPill status="custom" color="neutral" label="Expired" />
          case 'forfeited':
            return <StatusPill status="custom" color="critical" label="Clawed back" />
          case 'reversed':
            return <StatusPill status="custom" color="critical" label="Reversed" />
          default:
            return <StatusPill status="custom" color="neutral" label={row.original.status} />
        }
      },
    },
  ]

  return (
    <>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search by player, bonus, or id…',
        }}
        filters={filters}
        quickFilters={quickFilters}
        totalCount={rows.length}
        filteredCount={filtered.length}
        countNoun="award"
        onReset={
          search !== '' ||
          initialStatus !== 'all' ||
          initialType !== 'all' ||
          initialQuick !== 'all' ||
          initialFrom !== '' ||
          initialTo !== '' ||
          initialMin !== '' ||
          initialMax !== ''
            ? () => {
                setSearch('')
                navigate(pathname)
              }
            : undefined
        }
      />
      <TransactionsAdvancedFilters
        initialFrom={initialFrom}
        initialTo={initialTo}
        initialMin={initialMin}
        initialMax={initialMax}
        amountUnit="SC"
        exportHref="/api/admin/transactions/bonus-awards/export"
        onNavigate={navigate}
      />
      <DataTable
        scope="bonus-awards"
        columns={columns}
        data={filtered}
        pagination="paginated"
        pageSize={50}
        density="compact"
        loading={isNavigating}
        hideToolbar
        emptyContent={
          <EmptyState
            icon={<Gift />}
            title="No bonus awards match these filters"
            description="Try a different status or type."
          />
        }
      />
    </>
  )
}
