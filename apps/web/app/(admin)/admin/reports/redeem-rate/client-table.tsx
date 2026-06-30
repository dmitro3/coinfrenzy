'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

export interface RedeemRateRow {
  date: string
  revenueUsd: string
  redemptionsUsd: string
  pendingUsd: string
  cumulativeRevenueUsd: string
  cumulativeRedemptionsUsd: string
  dailyRedemptionRate: string | null
  lifetimeRedemptionRate: string | null
}

interface Props {
  rows: RedeemRateRow[]
  formatMoney: (s: string) => string
}

export function RedeemRateTable({ rows, formatMoney }: Props) {
  const columns = React.useMemo<ColumnDef<RedeemRateRow, unknown>[]>(
    () => [
      { accessorKey: 'date', header: 'Date' },
      {
        accessorKey: 'revenueUsd',
        header: 'Purchases ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'redemptionsUsd',
        header: 'Paid out ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'pendingUsd',
        header: 'Pending ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'dailyRedemptionRate',
        header: 'Daily rate',
        cell: (c) => {
          const v = c.getValue() as string | null
          return v ? `${(Number(v) * 100).toFixed(2)}%` : '—'
        },
      },
      {
        accessorKey: 'lifetimeRedemptionRate',
        header: 'Lifetime rate',
        cell: (c) => {
          const v = c.getValue() as string | null
          return v ? `${(Number(v) * 100).toFixed(2)}%` : '—'
        },
      },
      {
        accessorKey: 'cumulativeRevenueUsd',
        header: 'Cumulative purchases',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
      {
        accessorKey: 'cumulativeRedemptionsUsd',
        header: 'Cumulative paid',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
    ],
    [formatMoney],
  )

  return (
    <DataTable
      scope="reports.redeem-rate"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'date', desc: true }]}
      density="compact"
      emptyMessage="No redemption-rate snapshots in this date range."
    />
  )
}
