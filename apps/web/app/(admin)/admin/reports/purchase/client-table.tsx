'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

import { formatMoney } from '../_shared.client'

export interface PurchaseReportRow {
  playerId: string
  email: string
  username: string | null
  state: string | null
  kycLevel: number
  totalDepositedUsd: string
  totalRedeemedUsd: string
  netPositionUsd: string
  totalWageredSc: string
  totalWonSc: string
  ngrSc: string
  purchaseCount: number
  redemptionCount: number
  sessionCount: number
  firstPurchaseAt: string | null
  lastPurchaseAt: string | null
  computedAt: string
}

export function PurchaseReportTable({ rows }: { rows: PurchaseReportRow[] }) {
  const columns = React.useMemo<ColumnDef<PurchaseReportRow, unknown>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        cell: (c) => (
          <Link
            href={`/admin/players/${c.row.original.playerId}`}
            className="text-primary hover:underline"
          >
            {c.getValue() as string}
          </Link>
        ),
      },
      { accessorKey: 'username', header: 'Username', cell: (c) => c.getValue() ?? '—' },
      { accessorKey: 'state', header: 'State', cell: (c) => c.getValue() ?? '—' },
      { accessorKey: 'kycLevel', header: 'KYC' },
      {
        accessorKey: 'totalDepositedUsd',
        header: 'Purchased ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'totalRedeemedUsd',
        header: 'Redeemed ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'netPositionUsd',
        header: 'Net ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'totalWageredSc',
        header: 'Wagered (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalWonSc',
        header: 'Won (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'ngrSc',
        header: 'NGR (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      { accessorKey: 'purchaseCount', header: '# Buys' },
      { accessorKey: 'redemptionCount', header: '# Redeems' },
      { accessorKey: 'sessionCount', header: '# Sessions' },
      {
        accessorKey: 'firstPurchaseAt',
        header: 'First buy',
        cell: (c) => (c.getValue() ? new Date(c.getValue() as string).toLocaleDateString() : '—'),
      },
      {
        accessorKey: 'lastPurchaseAt',
        header: 'Last buy',
        cell: (c) => (c.getValue() ? new Date(c.getValue() as string).toLocaleDateString() : '—'),
      },
    ],
    [],
  )

  return (
    <DataTable
      scope="reports.purchase"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'totalDepositedUsd', desc: true }]}
      globalFilterPlaceholder="Filter by email, username, state…"
      density="compact"
      emptyMessage="No player_lifetime_stats rows yet — the rollup runs hourly."
    />
  )
}
