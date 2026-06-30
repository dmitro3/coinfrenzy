'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

import { formatMoney } from '../_shared.client'

export interface DailyKpiRow {
  date: string
  dayOfWeek: string
  dau: number
  uniqueLogins: number
  newRegistered: number
  totalScStaked: string
  totalScWon: string
  totalGgrSc: string
  totalNgrSc: string
  totalDepositsUsd: string
  depositorsCount: number
  firstTimePurchasers: number
  withdrawalsCompletedUsd: string
  bonusTotal: string
  abpPerDau: string | null
  aggrPerDau: string | null
  angrPerDau: string | null
}

export function DailyKpisTable({ rows }: { rows: DailyKpiRow[] }) {
  const columns = React.useMemo<ColumnDef<DailyKpiRow, unknown>[]>(
    () => [
      { accessorKey: 'date', header: 'Date' },
      { accessorKey: 'dayOfWeek', header: 'Day' },
      { accessorKey: 'dau', header: 'DAU', cell: (c) => (c.getValue() as number).toLocaleString() },
      {
        accessorKey: 'uniqueLogins',
        header: 'Logins',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'newRegistered',
        header: 'Signups',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'totalScStaked',
        header: 'SC staked',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalScWon',
        header: 'SC won',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalGgrSc',
        header: 'GGR (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalNgrSc',
        header: 'NGR (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalDepositsUsd',
        header: 'Purchases ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'depositorsCount',
        header: 'Purchasers',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'firstTimePurchasers',
        header: 'FTPs',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'withdrawalsCompletedUsd',
        header: 'Redeemed ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'bonusTotal',
        header: 'Bonus (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      { accessorKey: 'abpPerDau', header: 'ABP/DAU', cell: (c) => c.getValue() ?? '—' },
      { accessorKey: 'aggrPerDau', header: 'AGGR/DAU', cell: (c) => c.getValue() ?? '—' },
      { accessorKey: 'angrPerDau', header: 'ANGR/DAU', cell: (c) => c.getValue() ?? '—' },
    ],
    [],
  )

  return (
    <DataTable
      scope="reports.daily-kpis"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'date', desc: true }]}
      globalFilterPlaceholder="Filter by date or value…"
      density="compact"
      emptyMessage="No snapshots in this date range."
    />
  )
}
