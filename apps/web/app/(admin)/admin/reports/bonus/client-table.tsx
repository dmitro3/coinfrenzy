'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

import { formatMoney } from '../_shared.client'

export interface BonusReportRow {
  bonusType: string
  awardedCount: number
  totalSc: string
  totalGc: string
  completedCount: number
  expiredCount: number
  forfeitedCount: number
  avgPlaythroughProgress: string | null
}

export function BonusReportTable({ rows }: { rows: BonusReportRow[] }) {
  const columns = React.useMemo<ColumnDef<BonusReportRow, unknown>[]>(
    () => [
      {
        accessorKey: 'bonusType',
        header: 'Bonus type',
        cell: (c) => (c.getValue() as string).replace(/_/g, ' '),
      },
      {
        accessorKey: 'awardedCount',
        header: 'Awarded',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'totalSc',
        header: 'Total SC',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalGc',
        header: 'Total GC',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'completedCount',
        header: 'Completed',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'expiredCount',
        header: 'Expired',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'forfeitedCount',
        header: 'Forfeited',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'avgPlaythroughProgress',
        header: 'Avg PT progress',
        cell: (c) => {
          const v = c.getValue() as string | null
          if (v === null) return '—'
          return `${(Number(v) * 100).toFixed(1)}%`
        },
      },
    ],
    [],
  )

  return (
    <DataTable
      scope="reports.bonus"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'totalSc', desc: true }]}
      density="compact"
      emptyMessage="No bonus awards in this date range."
    />
  )
}
