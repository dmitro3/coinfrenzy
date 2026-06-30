'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Building2, MoreHorizontal } from 'lucide-react'

import {
  DataTable,
  EmptyState,
  FilterBar,
  StatusPill,
  type FilterDropdown,
  type QuickFilter,
} from '@coinfrenzy/ui/admin'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@coinfrenzy/ui/primitives/dropdown-menu'

import { formatCoins } from '@/lib/format'

export interface ProviderRowJson {
  id: string
  slug: string
  displayName: string
  status: string
  aggregator: string
  gameCount: number
  plays: number
  ggrSc: string
  rtpAvg: number | null
  rank: number
}

interface Props {
  rows: ProviderRowJson[]
  totalGgrSc: string
  windowLabel: string
}

export function ProvidersListClient({ rows, totalGgrSc, windowLabel }: Props) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = React.useState<'ggr' | 'plays' | 'rtp' | 'name'>('ggr')

  const totalGgr = React.useMemo(() => BigInt(totalGgrSc), [totalGgrSc])

  const filtered = React.useMemo(() => {
    let out = rows
    if (status !== 'all') out = out.filter((r) => r.status === status)
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      out = out.filter((r) => r.displayName.toLowerCase().includes(q) || r.slug.includes(q))
    }
    if (sort === 'ggr') {
      out = [...out].sort((a, b) => Number(BigInt(b.ggrSc) - BigInt(a.ggrSc)))
    } else if (sort === 'plays') {
      out = [...out].sort((a, b) => b.plays - a.plays)
    } else if (sort === 'rtp') {
      out = [...out].sort((a, b) => (b.rtpAvg ?? 0) - (a.rtpAvg ?? 0))
    } else {
      out = [...out].sort((a, b) => a.displayName.localeCompare(b.displayName))
    }
    // Re-rank after sort so #1/#2/#3 reflect the currently-displayed order.
    return out.map((r, idx) => ({ ...r, rank: idx }))
  }, [rows, status, search, sort])

  const filters: FilterDropdown[] = [
    {
      key: 'status',
      label: 'Status',
      value: status,
      onChange: (v) => setStatus(v as typeof status),
      options: [
        { value: 'all', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
    {
      key: 'sort',
      label: 'Sort',
      value: sort,
      onChange: (v) => setSort(v as typeof sort),
      options: [
        { value: 'ggr', label: `GGR (${windowLabel})` },
        { value: 'plays', label: `Plays (${windowLabel})` },
        { value: 'rtp', label: 'RTP avg' },
        { value: 'name', label: 'Name' },
      ],
    },
  ]

  const quickFilters: QuickFilter[] = [
    { label: 'All', value: 'all', active: status === 'all', onClick: () => setStatus('all') },
    {
      label: 'Active',
      value: 'active',
      active: status === 'active',
      onClick: () => setStatus('active'),
    },
    {
      label: 'Disabled',
      value: 'inactive',
      active: status === 'inactive',
      onClick: () => setStatus('inactive'),
    },
  ]

  const columns: ColumnDef<ProviderRowJson>[] = [
    {
      id: 'rank',
      header: '',
      cell: ({ row }) => <RankBadge rank={row.original.rank} />,
    },
    {
      id: 'provider',
      header: 'Provider',
      cell: ({ row }) => (
        <Link
          href={`/admin/casino/providers/${row.original.slug}`}
          className="flex items-center gap-3"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-elevated text-ink-secondary">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink-primary">
              {row.original.displayName}
            </div>
            <div className="truncate text-xs text-ink-tertiary">via {row.original.aggregator}</div>
          </div>
        </Link>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.status === 'active' ? (
          <StatusPill status="active" />
        ) : (
          <StatusPill status="custom" color="neutral" label={row.original.status} />
        ),
    },
    {
      id: 'gameCount',
      header: 'Games',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-ink-primary">
          {row.original.gameCount.toLocaleString()}
        </span>
      ),
    },
    {
      id: 'plays',
      header: `Plays (${windowLabel})`,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-ink-primary">
          {row.original.plays.toLocaleString()}
        </span>
      ),
    },
    {
      id: 'ggr',
      header: `GGR (${windowLabel})`,
      meta: { align: 'right' },
      cell: ({ row }) => {
        const share = computeShare(BigInt(row.original.ggrSc), totalGgr)
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm tabular-nums text-ink-primary">
              {formatCoins(row.original.ggrSc)} <span className="text-ink-tertiary">SC</span>
            </span>
            <span className="text-xs tabular-nums text-ink-tertiary">{share}</span>
          </div>
        )
      },
    },
    {
      id: 'rtp',
      header: 'RTP avg',
      meta: { align: 'right' },
      cell: ({ row }) =>
        row.original.rtpAvg != null ? (
          <span className="text-sm tabular-nums text-ink-primary">
            {(row.original.rtpAvg * 100).toFixed(2)}%
          </span>
        ) : (
          <span className="text-sm text-ink-tertiary">—</span>
        ),
    },
    {
      id: 'integration',
      header: 'Integration',
      cell: () => <StatusPill status="custom" color="positive" label="Healthy" dot />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/admin/casino/providers/${row.original.slug}`}>View profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/casino/games?provider=${row.original.slug}`}>View games</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search providers…',
        }}
        filters={filters}
        quickFilters={quickFilters}
        totalCount={rows.length}
        filteredCount={filtered.length}
        countNoun="provider"
        onReset={
          search !== '' || status !== 'all' || sort !== 'ggr'
            ? () => {
                setSearch('')
                setStatus('all')
                setSort('ggr')
              }
            : undefined
        }
      />
      <DataTable
        scope="casino-providers"
        columns={columns}
        data={filtered}
        pagination="paginated"
        pageSize={25}
        hideToolbar
        onRowClick={(row) => router.push(`/admin/casino/providers/${row.slug}`)}
        emptyContent={
          <EmptyState
            icon={<Building2 />}
            title="No providers match these filters"
            description="Try changing the status or clearing your search."
          />
        }
      />
    </>
  )
}

/**
 * Compact #1/#2/#3 medal pill, or a muted row number for ranks 4+.
 */
function RankBadge({ rank }: { rank: number }) {
  if (rank < 3) {
    const tones = [
      'bg-amber-500 text-amber-50',
      'bg-slate-400 text-slate-50',
      'bg-amber-700 text-amber-50',
    ]
    return (
      <span
        className={
          'inline-flex h-6 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ' +
          tones[rank]
        }
        title={`Rank #${rank + 1} by GGR in current window`}
      >
        #{rank + 1}
      </span>
    )
  }
  return <span className="text-xs tabular-nums text-ink-tertiary">{rank + 1}</span>
}

function computeShare(value: bigint, total: bigint): string {
  if (total <= 0n) return '—'
  // bps = (value / total) * 10_000 so we can render two decimals from a bigint.
  const bps = Number((value * 10_000n) / total)
  const pct = bps / 100
  if (!isFinite(pct)) return '—'
  return `${pct.toFixed(2)}% share`
}
