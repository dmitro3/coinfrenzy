'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Coins } from 'lucide-react'

import {
  DataTable,
  EmptyState,
  FilterBar,
  StatusPill,
  type FilterDropdown,
  type QuickFilter,
} from '@coinfrenzy/ui/admin'
import { Input } from '@coinfrenzy/ui/primitives/input'

import { formatCoins } from '@/lib/format'

import { TransactionsExportButton } from '../_export-button'

export interface CasinoActivityRowJson {
  id: string
  createdAt: string
  source: 'bet' | 'win'
  amount: string
  currency: 'GC' | 'SC'
  playerId: string | null
  playerEmail: string | null
  gameId: string | null
  gameName: string | null
  providerSlug: string | null
  providerName: string | null
  roundId: string | null
  pairId: string
}

interface Props {
  rows: CasinoActivityRowJson[]
  providers: { slug: string; name: string }[]
  initialFilters: {
    type: string
    currency: string
    quick: string
    provider: string
    min: string
    max: string
  }
}

export function CasinoActivityClient({ rows, providers, initialFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState('')
  const [localMin, setLocalMin] = React.useState(initialFilters.min)
  const [localMax, setLocalMax] = React.useState(initialFilters.max)

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '' || value === 'all') next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const applyAmount = React.useCallback(() => {
    update({ min: localMin || null, max: localMax || null })
  }, [localMin, localMax, update])

  const filtered = React.useMemo(() => {
    if (search.trim() === '') return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        (r.playerEmail ?? '').toLowerCase().includes(q) ||
        (r.gameName ?? '').toLowerCase().includes(q) ||
        (r.providerName ?? '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.roundId ?? '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const dropdowns: FilterDropdown[] = [
    {
      key: 'type',
      label: 'Type',
      value: initialFilters.type,
      onChange: (v) => update({ type: v }),
      options: [
        { value: 'all', label: 'Bets + wins' },
        { value: 'bet', label: 'Bets only' },
        { value: 'win', label: 'Wins only' },
      ],
    },
    {
      key: 'currency',
      label: 'Currency',
      value: initialFilters.currency,
      onChange: (v) => update({ currency: v }),
      options: [
        { value: 'all', label: 'SC + GC' },
        { value: 'SC', label: 'SC only' },
        { value: 'GC', label: 'GC only' },
      ],
    },
    {
      key: 'provider',
      label: 'Provider',
      value: initialFilters.provider,
      onChange: (v) => update({ provider: v }),
      options: [
        { value: 'all', label: 'All providers' },
        ...providers.map((p) => ({ value: p.slug, label: p.name })),
      ],
    },
  ]

  const quickFilters: QuickFilter[] = [
    {
      label: 'Today',
      value: 'today',
      active: initialFilters.quick === 'today',
      onClick: () => update({ quick: 'today' }),
    },
    {
      label: '7d',
      value: '7d',
      active: initialFilters.quick === '7d',
      onClick: () => update({ quick: '7d' }),
    },
    {
      label: '30d',
      value: '30d',
      active: initialFilters.quick === '30d',
      onClick: () => update({ quick: '30d' }),
    },
    {
      label: '90d',
      value: '90d',
      active: initialFilters.quick === '90d',
      onClick: () => update({ quick: '90d' }),
    },
    {
      label: 'All',
      value: 'all',
      active: initialFilters.quick === 'all' || initialFilters.quick === '',
      onClick: () => update({ quick: 'all' }),
    },
  ]

  const columns: ColumnDef<CasinoActivityRowJson>[] = [
    {
      id: 'when',
      header: 'When',
      enableSorting: true,
      accessorFn: (r) => new Date(r.createdAt).getTime(),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-ink-primary tabular-nums">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
          <span className="text-[11px] text-ink-tertiary tabular-nums">
            {new Date(row.original.createdAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
      ),
    },
    {
      id: 'player',
      header: 'Player',
      accessorFn: (r) => r.playerEmail ?? '',
      enableSorting: true,
      cell: ({ row }) =>
        row.original.playerId ? (
          <Link
            href={`/admin/players/${row.original.playerId}`}
            className="block min-w-0 truncate text-ink-primary hover:underline"
          >
            {row.original.playerEmail ?? '—'}
          </Link>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    {
      id: 'game',
      header: 'Game',
      accessorFn: (r) => r.gameName ?? '',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="truncate text-ink-primary">{row.original.gameName ?? '—'}</span>
          <span className="text-[11px] text-ink-tertiary">{row.original.providerName ?? '—'}</span>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessorFn: (r) => r.source,
      enableSorting: true,
      cell: ({ row }) =>
        row.original.source === 'bet' ? (
          <StatusPill status="custom" color="neutral" label="Bet" />
        ) : (
          <StatusPill status="custom" color="positive" label="Win" />
        ),
    },
    {
      id: 'amount',
      header: 'Amount',
      accessorFn: (r) => Number(r.amount),
      enableSorting: true,
      meta: { align: 'right' },
      cell: ({ row }) => {
        const isWin = row.original.source === 'win'
        return (
          <span className={'tabular-nums ' + (isWin ? 'text-positive' : 'text-ink-primary')}>
            {isWin ? '+' : '-'}
            {formatCoins(row.original.amount)}{' '}
            <span className="text-[11px] text-ink-tertiary">{row.original.currency}</span>
          </span>
        )
      },
    },
    {
      id: 'round',
      header: 'Round',
      cell: ({ row }) =>
        row.original.roundId ? (
          <span
            className="block max-w-[140px] truncate font-mono text-[11px] text-ink-tertiary"
            title={row.original.roundId}
          >
            {row.original.roundId}
          </span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
  ]

  const hasActiveFilters =
    search !== '' ||
    initialFilters.type !== 'all' ||
    initialFilters.currency !== 'all' ||
    initialFilters.provider !== 'all' ||
    initialFilters.quick !== '7d' ||
    initialFilters.min !== '' ||
    initialFilters.max !== ''

  return (
    <>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search by player, game, provider, ledger id, round id…',
        }}
        filters={dropdowns}
        quickFilters={quickFilters}
        totalCount={rows.length}
        filteredCount={filtered.length}
        countNoun="event"
        onReset={
          hasActiveFilters
            ? () => {
                setSearch('')
                setLocalMin('')
                setLocalMax('')
                router.push(pathname)
              }
            : undefined
        }
      />
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line-subtle bg-surface px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
          Amount range
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          Min
          <Input
            type="number"
            min={0}
            step="0.01"
            value={localMin}
            onChange={(e) => setLocalMin(e.target.value)}
            placeholder="0.00"
            className="h-8 w-28 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          Max
          <Input
            type="number"
            min={0}
            step="0.01"
            value={localMax}
            onChange={(e) => setLocalMax(e.target.value)}
            placeholder="∞"
            className="h-8 w-28 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={applyAmount}
          className="inline-flex h-8 items-center rounded-md border border-line-subtle bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-line-default hover:text-ink-primary"
        >
          Apply
        </button>
        {initialFilters.min !== '' || initialFilters.max !== '' ? (
          <button
            type="button"
            onClick={() => {
              setLocalMin('')
              setLocalMax('')
              update({ min: null, max: null })
            }}
            className="inline-flex h-8 items-center rounded-md px-2 text-xs text-ink-tertiary hover:text-ink-primary"
          >
            Clear amount
          </button>
        ) : null}
        <div className="ml-auto">
          <TransactionsExportButton href="/api/admin/transactions/casino/export" />
        </div>
      </div>
      <DataTable
        scope="transactions.casino"
        columns={columns}
        data={filtered}
        pagination="paginated"
        pageSize={50}
        density="compact"
        hideToolbar
        defaultSort={[{ id: 'when', desc: true }]}
        emptyContent={
          <EmptyState
            icon={<Coins />}
            title="No casino activity in this window"
            description="Adjust the filters or expand the time range to see more."
          />
        }
      />
    </>
  )
}
