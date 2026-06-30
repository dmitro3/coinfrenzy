'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Gamepad2 } from 'lucide-react'

import {
  DataTable,
  EmptyState,
  FilterBar,
  StatusPill,
  type FilterDropdown,
  type QuickFilter,
} from '@coinfrenzy/ui/admin'

import { formatCoins } from '@/lib/format'

export interface GameRowJson {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  category: string
  subCategory: string | null
  rtp: string | null
  volatility: string | null
  status: string
  isFeatured: boolean
  isNew: boolean
  playsToday: number
  ggrTodaySc: string
}

interface Props {
  rows: GameRowJson[]
  initialProvider: string
  /** Label of the current time window — appended to the plays/GGR columns. */
  windowLabel?: string
  /** Pre-computed summary numbers used by quick filters / status pill. */
  windowSummary?: { active: number; newThisWeek: number }
}

export function GamesListClient({ rows, initialProvider, windowLabel }: Props) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [provider, setProvider] = React.useState(initialProvider)
  const [category, setCategory] = React.useState('all')
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [quick, setQuick] = React.useState<'all' | 'featured' | 'hot' | 'new' | 'disabled'>('all')

  const providerOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((r) => map.set(r.providerSlug, r.providerName))
    return Array.from(map.entries()).map(([slug, name]) => ({ value: slug, label: name }))
  }, [rows])

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => set.add(r.category))
    return Array.from(set).map((c) => ({ value: c, label: c }))
  }, [rows])

  const filtered = React.useMemo(() => {
    let out = rows
    if (provider !== 'all') out = out.filter((r) => r.providerSlug === provider)
    if (category !== 'all') out = out.filter((r) => r.category === category)
    if (status !== 'all') out = out.filter((r) => r.status === status)
    if (quick === 'featured') out = out.filter((r) => r.isFeatured)
    else if (quick === 'new') out = out.filter((r) => r.isNew)
    else if (quick === 'hot') {
      out = [...out].sort((a, b) => b.playsToday - a.playsToday)
      out = out.filter((r) => r.playsToday > 0)
    } else if (quick === 'disabled') out = out.filter((r) => r.status !== 'active')

    if (search.trim() !== '') {
      const q = search.toLowerCase()
      out = out.filter(
        (r) =>
          r.displayName.toLowerCase().includes(q) ||
          r.providerName.toLowerCase().includes(q) ||
          r.slug.includes(q),
      )
    }
    return out
  }, [rows, provider, category, status, quick, search])

  const filters: FilterDropdown[] = [
    {
      key: 'provider',
      label: 'Provider',
      value: provider,
      onChange: setProvider,
      options: [{ value: 'all', label: 'All providers' }, ...providerOptions],
    },
    {
      key: 'category',
      label: 'Category',
      value: category,
      onChange: setCategory,
      options: [{ value: 'all', label: 'All categories' }, ...categoryOptions],
    },
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
  ]

  const quickFilters: QuickFilter[] = [
    { label: 'All', value: 'all', active: quick === 'all', onClick: () => setQuick('all') },
    { label: 'Hot', value: 'hot', active: quick === 'hot', onClick: () => setQuick('hot') },
    {
      label: 'Featured',
      value: 'featured',
      active: quick === 'featured',
      onClick: () => setQuick('featured'),
    },
    { label: 'New (7d)', value: 'new', active: quick === 'new', onClick: () => setQuick('new') },
    {
      label: 'Disabled',
      value: 'disabled',
      active: quick === 'disabled',
      onClick: () => setQuick('disabled'),
    },
  ]

  const columns: ColumnDef<GameRowJson>[] = [
    {
      id: 'game',
      header: 'Game',
      cell: ({ row }) => (
        <Link href={`/admin/casino/games/${row.original.slug}`} className="flex items-center gap-3">
          <div className="flex h-7 w-10 shrink-0 items-center justify-center rounded-sm bg-elevated text-ink-tertiary">
            <Gamepad2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink-primary">
                {row.original.displayName}
              </span>
              {row.original.isFeatured ? (
                <StatusPill status="custom" color="notice" label="Featured" />
              ) : null}
              {row.original.isNew ? (
                <StatusPill status="custom" color="positive" label="New" />
              ) : null}
            </div>
            <div className="truncate text-xs text-ink-tertiary">{row.original.providerName}</div>
          </div>
        </Link>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <span className="text-sm text-ink-secondary">{row.original.category}</span>
      ),
    },
    {
      id: 'rtp',
      header: 'RTP',
      meta: { align: 'right' },
      cell: ({ row }) =>
        row.original.rtp ? (
          <span className="tabular-nums text-ink-primary">
            {(Number(row.original.rtp) * 100).toFixed(2)}%
          </span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    {
      id: 'volatility',
      header: 'Vol',
      cell: ({ row }) => (
        <span className="text-ink-secondary capitalize">
          {row.original.volatility?.replace('_', ' ') ?? '—'}
        </span>
      ),
    },
    {
      id: 'plays',
      header: windowLabel ? `Plays (${windowLabel})` : 'Plays today',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-primary">
          {row.original.playsToday.toLocaleString()}
        </span>
      ),
    },
    {
      id: 'ggr',
      header: windowLabel ? `GGR (${windowLabel})` : 'GGR today',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-primary">
          {formatCoins(row.original.ggrTodaySc)} <span className="text-ink-tertiary">SC</span>
        </span>
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
  ]

  return (
    <>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search games or providers…',
        }}
        filters={filters}
        quickFilters={quickFilters}
        totalCount={rows.length}
        filteredCount={filtered.length}
        countNoun="game"
        onReset={
          search !== '' ||
          provider !== 'all' ||
          category !== 'all' ||
          status !== 'all' ||
          quick !== 'all'
            ? () => {
                setSearch('')
                setProvider('all')
                setCategory('all')
                setStatus('all')
                setQuick('all')
              }
            : undefined
        }
      />
      <DataTable
        scope="casino-games"
        columns={columns}
        data={filtered}
        pagination="paginated"
        pageSize={50}
        density="compact"
        hideToolbar
        onRowClick={(row) => router.push(`/admin/casino/games/${row.slug}`)}
        emptyContent={
          <EmptyState
            icon={<Gamepad2 />}
            title="No games match these filters"
            description="Try a different provider, category, or quick filter."
          />
        }
      />
    </>
  )
}
