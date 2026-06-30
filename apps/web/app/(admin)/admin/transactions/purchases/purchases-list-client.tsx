'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { CreditCard } from 'lucide-react'

import {
  DataTable,
  EmptyState,
  FilterBar,
  StatusPill,
  type FilterDropdown,
  type QuickFilter,
} from '@coinfrenzy/ui/admin'

import { formatCoins, formatUsd } from '@/lib/format'

import { TransactionsAdvancedFilters } from '../_advanced-filters'

export interface PurchaseRowJson {
  id: string
  createdAt: string
  playerEmail: string
  playerId: string
  amountUsd: string
  baseGc: string
  baseSc: string
  bonusGc: string
  bonusSc: string
  cardBrand: string | null
  cardLast4: string | null
  status: string
  packageName: string | null
}

interface Props {
  rows: PurchaseRowJson[]
  initialStatus: string
  initialQuick: string
  initialFrom: string
  initialTo: string
  initialMin: string
  initialMax: string
}

export function PurchasesListClient({
  rows,
  initialStatus,
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
          r.id.includes(q) ||
          (r.packageName ?? '').toLowerCase().includes(q),
      )
    }
    return out
  }, [rows, search])

  const filters: FilterDropdown[] = [
    {
      key: 'status',
      label: 'Status',
      value: initialStatus,
      onChange: (v) => update('status', v),
      options: [
        { value: 'all', label: 'All' },
        { value: 'completed', label: 'Completed' },
        { value: 'pending', label: 'Pending' },
        { value: 'failed', label: 'Failed' },
        { value: 'refunded', label: 'Refunded' },
        { value: 'disputed', label: 'Disputed' },
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
      label: 'Failed',
      value: 'failed',
      active: initialQuick === 'failed',
      onClick: () => update('quick', 'failed'),
    },
    {
      label: 'Disputed',
      value: 'disputed',
      active: initialQuick === 'disputed',
      onClick: () => update('quick', 'disputed'),
    },
    {
      label: 'Refunded',
      value: 'refunded',
      active: initialQuick === 'refunded',
      onClick: () => update('quick', 'refunded'),
    },
  ]

  const columns: ColumnDef<PurchaseRowJson>[] = [
    {
      id: 'when',
      header: 'When',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-ink-primary tabular-nums">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
          <span className="text-ink-tertiary tabular-nums">
            {new Date(row.original.createdAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
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
      id: 'package',
      header: 'Package',
      cell: ({ row }) => (
        <span className="text-ink-secondary">{row.original.packageName ?? 'Custom'}</span>
      ),
    },
    {
      id: 'gc',
      header: 'GC',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex flex-col items-end">
          <span className="tabular-nums text-ink-primary">
            {formatCoins(BigInt(row.original.baseGc) + BigInt(row.original.bonusGc))}
          </span>
          {BigInt(row.original.bonusGc) > 0n ? (
            <span className="text-[11px] text-positive">
              +{formatCoins(row.original.bonusGc)} bonus
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'sc',
      header: 'SC',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex flex-col items-end">
          <span className="tabular-nums text-ink-primary">
            {formatCoins(BigInt(row.original.baseSc) + BigInt(row.original.bonusSc))}
          </span>
          {BigInt(row.original.bonusSc) > 0n ? (
            <span className="text-[11px] text-positive">
              +{formatCoins(row.original.bonusSc)} bonus
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'usd',
      header: 'USD',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-primary">{formatUsd(row.original.amountUsd)}</span>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <span className="text-ink-secondary">
          {row.original.cardBrand
            ? `${row.original.cardBrand} ···· ${row.original.cardLast4 ?? '****'}`
            : '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => purchaseStatusPill(row.original.status),
    },
  ]

  return (
    <>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search by player, package, or transaction id…',
        }}
        filters={filters}
        quickFilters={quickFilters}
        totalCount={rows.length}
        filteredCount={filtered.length}
        countNoun="purchase"
        onReset={
          search !== '' ||
          initialStatus !== 'all' ||
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
        amountUnit="USD"
        exportHref="/api/admin/transactions/purchases/export"
        onNavigate={navigate}
      />
      <DataTable
        scope="purchases"
        columns={columns}
        data={filtered}
        pagination="paginated"
        pageSize={50}
        density="compact"
        loading={isNavigating}
        hideToolbar
        onRowClick={(row) => router.push(`/admin/transactions/purchases/${row.id}`)}
        emptyContent={
          <EmptyState
            icon={<CreditCard />}
            title="No purchases match these filters"
            description="Try a different status or quick filter."
          />
        }
      />
    </>
  )
}

function purchaseStatusPill(status: string) {
  switch (status) {
    case 'completed':
      return <StatusPill status="completed" />
    case 'pending':
      return <StatusPill status="pending" />
    case 'failed':
      return <StatusPill status="failed" />
    case 'refunded':
      return <StatusPill status="custom" color="critical" label="Refunded" />
    case 'disputed':
      return <StatusPill status="custom" color="critical" label="Disputed" />
    case 'cancelled':
      return <StatusPill status="cancelled" />
    default:
      return <StatusPill status="custom" color="neutral" label={status} />
  }
}
