'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { ArrowDownRight, ArrowUpRight, Coins, MoreHorizontal, Users } from 'lucide-react'

import { US_STATES, BLOCKED_STATES } from '@coinfrenzy/config'
import {
  DataTable,
  EmptyState,
  FilterBar,
  StatusPill,
  type FilterDropdown,
  type QuickFilter,
} from '@coinfrenzy/ui/admin'
import { Avatar, AvatarFallback } from '@coinfrenzy/ui/primitives/avatar'
import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@coinfrenzy/ui/primitives/dropdown-menu'

import {
  formatCoins,
  formatCompactCoins,
  formatCompactInt,
  formatCompactUsd,
  formatUsd,
} from '@/lib/format'

export interface PlayerRowJson {
  id: string
  email: string
  username: string | null
  displayName: string | null
  state: string | null
  status: string
  kycLevel: number
  scBalance: string
  gcBalance: string
  lifetimeSpendUsd: string
  lifetimeRedeemedUsd: string
  netPositionUsd: string
  purchaseCount: number
  redemptionCount: number
  totalWageredSc: string
  roundCount: number
  sessionCount: number
  daysActive: number
  lastSeenAt: string | null
  lastPurchaseAt: string | null
}

interface PlayersListClientProps {
  initialRows: PlayerRowJson[]
  totalCount: number
  filteredCount: number
}

type StatusFilter = 'all' | 'active' | 'suspended' | 'self_excluded' | 'closed'
type KycFilter = 'all' | '0' | '1' | '2' | '3'
type QuickKey = 'all' | 'active' | 'high-value' | 'new' | 'at-risk'

export function PlayersListClient({
  initialRows,
  totalCount,
  filteredCount,
}: PlayersListClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Read current filter values from URL.
  const search = searchParams.get('q') ?? ''
  const status = (searchParams.get('status') ?? 'all') as StatusFilter
  const kycLevel = (searchParams.get('kyc') ?? 'all') as KycFilter
  const stateFilter = searchParams.get('state') ?? 'all'
  const quickFilter = (searchParams.get('quick') ?? 'all') as QuickKey

  // Local search input — debounced before pushing to URL.
  const [searchInput, setSearchInput] = React.useState(search)
  React.useEffect(() => setSearchInput(search), [search])

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === search) return
      updateParam('q', searchInput || null)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce on input only
  }, [searchInput])

  function updateParam(key: string, value: string | null): void {
    const next = new URLSearchParams(searchParams.toString())
    if (value == null || value === '' || value === 'all') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function resetFilters(): void {
    setSearchInput('')
    router.push(pathname)
  }

  const filters: FilterDropdown[] = [
    {
      key: 'status',
      label: 'Status',
      value: status,
      onChange: (v) => updateParam('status', v),
      options: [
        { value: 'all', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'suspended', label: 'Suspended' },
        { value: 'self_excluded', label: 'Self-excluded' },
        { value: 'closed', label: 'Closed' },
      ],
    },
    {
      key: 'kyc',
      label: 'KYC',
      value: kycLevel,
      onChange: (v) => updateParam('kyc', v),
      options: [
        { value: 'all', label: 'All levels' },
        { value: '0', label: 'Level 0 — Unverified' },
        { value: '1', label: 'Level 1 — Basic' },
        { value: '2', label: 'Level 2 — Verified' },
        { value: '3', label: 'Level 3 — Enhanced' },
      ],
    },
    {
      key: 'state',
      label: 'State',
      value: stateFilter,
      onChange: (v) => updateParam('state', v),
      options: stateOptions(),
      // Insert a separator after the last allowed state (before blocked).
      separators: [allowedStatesCount()],
    },
  ]

  const quickFilters: QuickFilter[] = [
    {
      label: 'All',
      value: 'all',
      active: quickFilter === 'all',
      onClick: () => updateParam('quick', null),
    },
    {
      label: 'Active',
      value: 'active',
      active: quickFilter === 'active',
      onClick: () => updateParam('quick', 'active'),
    },
    {
      label: 'High value',
      value: 'high-value',
      active: quickFilter === 'high-value',
      onClick: () => updateParam('quick', 'high-value'),
    },
    {
      label: 'New (7d)',
      value: 'new',
      active: quickFilter === 'new',
      onClick: () => updateParam('quick', 'new'),
    },
    {
      label: 'At risk',
      value: 'at-risk',
      active: quickFilter === 'at-risk',
      onClick: () => updateParam('quick', 'at-risk'),
    },
  ]

  const columns = React.useMemo<ColumnDef<PlayerRowJson>[]>(() => {
    return [
      {
        id: 'player',
        header: 'Player',
        cell: ({ row }) => <PlayerCell row={row.original} />,
        // Sort by email so the column header still toggles a useful order.
        accessorFn: (row) => row.email,
        enableSorting: true,
      },
      {
        id: 'kyc',
        header: 'KYC',
        accessorFn: (row) => row.kycLevel,
        cell: ({ row }) => kycPill(row.original.kycLevel),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        cell: ({ row }) => statusPillFor(row.original.status),
      },
      {
        id: 'money',
        header: 'Spend / Redeem / Net',
        meta: { align: 'right' },
        // Sort by net position by default — the operator's most useful
        // column when triaging which players to look at first.
        accessorFn: (row) => bigintForSort(row.netPositionUsd),
        sortingFn: 'basic',
        cell: ({ row }) => <MoneyTriadCell row={row.original} />,
      },
      {
        id: 'wager',
        header: 'Wagered',
        meta: { align: 'right' },
        accessorFn: (row) => bigintForSort(row.totalWageredSc),
        sortingFn: 'basic',
        cell: ({ row }) => <WagerCell row={row.original} />,
      },
      {
        id: 'activity',
        header: 'Activity',
        meta: { align: 'right' },
        accessorFn: (row) => row.roundCount,
        sortingFn: 'basic',
        cell: ({ row }) => <ActivityCell row={row.original} />,
      },
      {
        id: 'balance',
        header: 'Balance',
        meta: { align: 'right' },
        accessorFn: (row) => bigintForSort(row.scBalance),
        sortingFn: 'basic',
        cell: ({ row }) => <BalanceCell row={row.original} />,
      },
      {
        id: 'lastSeen',
        header: 'Last seen',
        accessorFn: (row) => (row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0),
        sortingFn: 'basic',
        cell: ({ row }) =>
          row.original.lastSeenAt ? (
            <time
              dateTime={row.original.lastSeenAt}
              title={formatUtcDateTime(row.original.lastSeenAt)}
              className="text-sm text-ink-secondary"
            >
              {formatUtcDateTime(row.original.lastSeenAt)}
            </time>
          ) : (
            <span className="text-sm text-ink-tertiary">Never</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <ActionsMenu playerId={row.original.id} />,
      },
    ]
  }, [])

  const filterIsActive =
    search !== '' ||
    status !== 'all' ||
    kycLevel !== 'all' ||
    stateFilter !== 'all' ||
    quickFilter !== 'all'

  return (
    <div className="flex flex-col gap-5">
      <FilterBar
        search={{
          value: searchInput,
          onChange: setSearchInput,
          placeholder: 'Search by email, username, or name…',
        }}
        filters={filters}
        quickFilters={quickFilters}
        totalCount={totalCount}
        filteredCount={filteredCount}
        countNoun="player"
        onReset={filterIsActive ? resetFilters : undefined}
      />

      <DataTable
        scope="players-list"
        columns={columns}
        data={initialRows}
        pagination="paginated"
        pageSize={25}
        density="comfortable"
        hideToolbar
        onRowClick={(row) => router.push(`/admin/players/${row.id}`)}
        emptyContent={
          <EmptyState
            icon={<Users />}
            title="No players match these filters"
            description="Try adjusting your search or filter selection."
            action={
              filterIsActive ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Cells                                                                       */
/* -------------------------------------------------------------------------- */

function PlayerCell({ row }: { row: PlayerRowJson }) {
  const initials = initialsFor(row.displayName ?? row.username ?? row.email)
  const sub = row.username ?? row.displayName ?? '—'
  return (
    <Link href={`/admin/players/${row.id}`} className="flex min-w-0 items-center gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-elevated text-xs font-medium text-ink-secondary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink-primary">{row.email}</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-ink-tertiary">
          <span className="truncate">{sub}</span>
          {row.state ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px]">{row.state}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

function BalanceCell({ row }: { row: PlayerRowJson }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-sm tabular-nums text-ink-primary">
        {formatCoins(row.scBalance)} <span className="text-ink-tertiary">SC</span>
      </span>
      <span className="text-xs tabular-nums text-ink-tertiary">
        {formatCoins(row.gcBalance)} GC
      </span>
    </div>
  )
}

/**
 * Money triad: spend / redeem with the operator's net position color-coded.
 * Green = house net up (player has spent more than redeemed). Red = house
 * net down. Hovering each value reveals the full-precision number.
 */
function MoneyTriadCell({ row }: { row: PlayerRowJson }) {
  const net = BigInt(row.netPositionUsd)
  const positive = net >= 0n
  const tone = positive ? 'text-positive' : 'text-critical'
  const sign = positive ? '+' : '−'
  const absNet = positive ? net : -net
  return (
    <div className="flex flex-col items-end gap-0.5 leading-tight">
      <span
        className={`text-sm font-semibold tabular-nums ${tone}`}
        title={`Net: ${positive ? '' : '-'}${formatUsd(absNet.toString())}`}
      >
        {sign}
        {formatCompactUsd(absNet.toString())}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-tertiary">
        <span
          title={`${row.purchaseCount.toLocaleString()} purchases · ${formatUsd(row.lifetimeSpendUsd)}`}
        >
          <ArrowDownRight className="-mb-0.5 mr-0.5 inline h-3 w-3 text-positive/70" />
          {formatCompactUsd(row.lifetimeSpendUsd)}
        </span>
        <span
          title={`${row.redemptionCount.toLocaleString()} redemptions · ${formatUsd(row.lifetimeRedeemedUsd)}`}
        >
          <ArrowUpRight className="-mb-0.5 mr-0.5 inline h-3 w-3 text-critical/70" />
          {formatCompactUsd(row.lifetimeRedeemedUsd)}
        </span>
      </span>
    </div>
  )
}

/** Total wagered SC — both compact and with average bet (wager / rounds). */
function WagerCell({ row }: { row: PlayerRowJson }) {
  const wagered = BigInt(row.totalWageredSc)
  const avgBet = row.roundCount > 0 ? wagered / BigInt(row.roundCount) : 0n
  return (
    <div className="flex flex-col items-end gap-0.5 leading-tight">
      <span
        className="text-sm tabular-nums text-ink-primary"
        title={`${formatCoins(row.totalWageredSc)} SC wagered`}
      >
        <Coins className="-mb-0.5 mr-1 inline h-3 w-3 text-ink-tertiary" />
        {formatCompactCoins(row.totalWageredSc)}
      </span>
      <span className="text-[11px] tabular-nums text-ink-tertiary">
        avg{' '}
        <span title={`Average bet: ${formatCoins(avgBet)} SC`}>
          {row.roundCount > 0 ? formatCompactCoins(avgBet) : '—'}
        </span>{' '}
        / spin
      </span>
    </div>
  )
}

/**
 * Activity column: spin count headline + sessions / days-active subline.
 * Compact integers everywhere so the column stays narrow at scale.
 */
function ActivityCell({ row }: { row: PlayerRowJson }) {
  return (
    <div className="flex flex-col items-end gap-0.5 leading-tight">
      <span
        className="text-sm tabular-nums text-ink-primary"
        title={`${row.roundCount.toLocaleString()} spins`}
      >
        {formatCompactInt(row.roundCount)}{' '}
        <span className="text-[11px] text-ink-tertiary">spins</span>
      </span>
      <span className="text-[11px] tabular-nums text-ink-tertiary">
        {formatCompactInt(row.sessionCount)} sessions · {row.daysActive}d active
      </span>
    </div>
  )
}

/**
 * Convert a minor-unit bigint string to a sortable number. Drops precision
 * for very large values, but the display still uses the full bigint via
 * formatters; this is only for tanstack's compare function.
 */
function bigintForSort(value: string): number {
  if (!value) return 0
  // Strip any trailing decimal noise that came from numeric(20,4) output.
  const cleaned = value.includes('.') ? value.split('.')[0]! : value
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function ActionsMenu({ playerId }: { playerId: string }) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Open actions menu"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/admin/players/${playerId}`}>View profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/players/${playerId}#suspend`}>Suspend</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/players/${playerId}#adjust-balance`}>Adjust balance</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/players/${playerId}#reset-2fa`}>Reset 2FA</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/players/${playerId}#send-email`}>Send email</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function statusPillFor(status: string) {
  switch (status) {
    case 'active':
      return <StatusPill status="active" />
    case 'suspended':
      return <StatusPill status="suspended" />
    case 'self_excluded':
      return <StatusPill status="self-excluded" />
    case 'closed':
      return <StatusPill status="closed" />
    case 'restricted':
      return <StatusPill status="custom" color="attention" label="Restricted" />
    case 'internal':
      return <StatusPill status="custom" color="notice" label="Internal" />
    default:
      return <StatusPill status="custom" color="neutral" label={status} />
  }
}

function kycPill(level: number) {
  if (level === 0) return <StatusPill status="kyc-unverified" label="L0" />
  if (level === 1) return <StatusPill status="custom" color="attention" label={`L${level}`} />
  if (level === 2) return <StatusPill status="custom" color="positive" label={`L${level}`} />
  return <StatusPill status="custom" color="positive" label={`L${level}`} />
}

function initialsFor(text: string): string {
  const cleaned = text.replace(/[^a-z0-9 ]/gi, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

function formatUtcDateTime(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const sec = String(d.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec} UTC`
}

function stateOptions() {
  const allowed = US_STATES.filter((s) => !BLOCKED_STATES.has(s.code)).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const blocked = US_STATES.filter((s) => BLOCKED_STATES.has(s.code)).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return [
    { value: 'all', label: 'All states' },
    ...allowed.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` })),
    ...blocked.map((s) => ({
      value: s.code,
      label: `${s.name} (${s.code}) — blocked`,
    })),
  ]
}

function allowedStatesCount() {
  return US_STATES.filter((s) => !BLOCKED_STATES.has(s.code)).length + 1 // +1 for "All states"
}
