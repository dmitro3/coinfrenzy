'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Banknote } from 'lucide-react'

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

export interface RedemptionRowJson {
  id: string
  createdAt: string
  playerEmail: string
  playerId: string
  amountUsd: string
  amountSc: string
  method: string
  status: string
  paidAt: string | null
  approvedAt: string | null
  kycLevel: number
}

interface Props {
  rows: RedemptionRowJson[]
  initialStatus: string
  initialQuick: string
  initialFrom: string
  initialTo: string
  initialMin: string
  initialMax: string
  initialKyc: string
}

export function RedemptionsListClient({
  rows,
  initialStatus,
  initialQuick,
  initialFrom,
  initialTo,
  initialMin,
  initialMax,
  initialKyc,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState('')

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value == null || value === '' || value === 'all') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const filtered = React.useMemo(() => {
    let out = rows
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      out = out.filter((r) => r.playerEmail.toLowerCase().includes(q) || r.id.includes(q))
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
        { value: 'pending_review', label: 'Pending review' },
        { value: 'kyc_pending', label: 'KYC pending' },
        { value: 'aml_hold', label: 'AML hold' },
        { value: 'approved', label: 'Approved' },
        { value: 'submitted', label: 'Submitted' },
        { value: 'paid', label: 'Paid' },
        { value: 'failed', label: 'Failed' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
    },
    {
      key: 'kyc',
      label: 'KYC',
      value: initialKyc,
      onChange: (v) => update('kyc', v),
      options: [
        { value: 'all', label: 'Any KYC' },
        { value: '0', label: 'Level 0 (unverified)' },
        { value: '1', label: 'Level 1' },
        { value: '2', label: 'Level 2 (verified)' },
        { value: '3', label: 'Level 3 (enhanced)' },
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
      label: 'Pending review',
      value: 'pending-review',
      active: initialQuick === 'pending-review',
      onClick: () => update('quick', 'pending-review'),
    },
    {
      label: 'KYC pending',
      value: 'kyc-pending',
      active: initialQuick === 'kyc-pending',
      onClick: () => update('quick', 'kyc-pending'),
    },
    {
      label: 'AML hold',
      value: 'aml-hold',
      active: initialQuick === 'aml-hold',
      onClick: () => update('quick', 'aml-hold'),
    },
    {
      label: 'Paid',
      value: 'paid',
      active: initialQuick === 'paid',
      onClick: () => update('quick', 'paid'),
    },
    {
      label: 'Failed',
      value: 'failed',
      active: initialQuick === 'failed',
      onClick: () => update('quick', 'failed'),
    },
  ]

  const columns: ColumnDef<RedemptionRowJson>[] = [
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
      id: 'usd',
      header: 'USD',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-primary">{formatUsd(row.original.amountUsd)}</span>
      ),
    },
    {
      id: 'sc',
      header: 'SC source',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-secondary">
          {formatCoins(row.original.amountSc)}
        </span>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <span className="text-ink-secondary">
          {row.original.method === 'finix_ach'
            ? 'Finix ACH'
            : row.original.method === 'apt_debit'
              ? 'Debit (APT)'
              : row.original.method}
        </span>
      ),
    },
    {
      id: 'kyc',
      header: 'KYC',
      cell: ({ row }) =>
        row.original.kycLevel >= 2 ? (
          <StatusPill status="custom" color="positive" label={`L${row.original.kycLevel}`} />
        ) : (
          <StatusPill status="custom" color="attention" label={`L${row.original.kycLevel}`} />
        ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => redemptionStatusPill(row.original.status),
    },
    {
      id: 'processing',
      header: 'Processing',
      cell: ({ row }) => {
        if (!row.original.paidAt) return <span className="text-ink-tertiary">—</span>
        const ms =
          new Date(row.original.paidAt).getTime() - new Date(row.original.createdAt).getTime()
        const hours = ms / 3600_000
        return (
          <span className="text-ink-secondary tabular-nums">
            {hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(1)}h`}
          </span>
        )
      },
    },
  ]

  return (
    <>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search by player or redemption id…',
        }}
        filters={filters}
        quickFilters={quickFilters}
        totalCount={rows.length}
        filteredCount={filtered.length}
        countNoun="redemption"
        onReset={
          search !== '' ||
          initialStatus !== 'all' ||
          initialQuick !== 'all' ||
          initialKyc !== 'all' ||
          initialFrom !== '' ||
          initialTo !== '' ||
          initialMin !== '' ||
          initialMax !== ''
            ? () => {
                setSearch('')
                router.push(pathname)
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
        exportHref="/api/admin/transactions/redemptions/export"
      />
      <DataTable
        scope="redemptions"
        columns={columns}
        data={filtered}
        pagination="paginated"
        pageSize={50}
        density="compact"
        hideToolbar
        onRowClick={(row) => router.push(`/admin/transactions/redemptions/${row.id}`)}
        emptyContent={
          <EmptyState
            icon={<Banknote />}
            title="No redemptions match these filters"
            description="Try a different status or quick filter."
          />
        }
      />
    </>
  )
}

function redemptionStatusPill(status: string) {
  switch (status) {
    case 'paid':
      return <StatusPill status="paid" />
    case 'approved':
      return <StatusPill status="approved" />
    case 'rejected':
      return <StatusPill status="rejected" />
    case 'failed':
      return <StatusPill status="failed" />
    case 'cancelled':
      return <StatusPill status="cancelled" />
    case 'pending_review':
      return <StatusPill status="custom" color="attention" label="Pending review" />
    case 'kyc_pending':
      return <StatusPill status="kyc-pending" />
    case 'aml_hold':
      return <StatusPill status="custom" color="critical" label="AML hold" />
    case 'submitted':
      return <StatusPill status="submitted" />
    default:
      return <StatusPill status="custom" color="neutral" label={status} />
  }
}
