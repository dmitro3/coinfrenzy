'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

export interface PlaythroughRow {
  bonusType: string
  awarded: number
  completed: number
  expired: number
  forfeited: number
  completionRate: number
  expiryRate: number
  forfeitRate: number
  avgCompletionHours: number | null
  avgProgressPct: number | null
}

export function PlaythroughTable({ rows }: { rows: PlaythroughRow[] }) {
  const columns = React.useMemo<ColumnDef<PlaythroughRow, unknown>[]>(
    () => [
      {
        accessorKey: 'bonusType',
        header: 'Bonus type',
        cell: (c) => (c.getValue() as string).replace(/_/g, ' '),
      },
      {
        accessorKey: 'awarded',
        header: 'Awarded',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'completed',
        header: 'Completed',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'completionRate',
        header: 'Completion %',
        cell: (c) => `${(c.getValue() as number).toFixed(1)}%`,
      },
      {
        accessorKey: 'expiryRate',
        header: 'Expiry %',
        cell: (c) => `${(c.getValue() as number).toFixed(1)}%`,
      },
      {
        accessorKey: 'forfeitRate',
        header: 'Forfeit %',
        cell: (c) => `${(c.getValue() as number).toFixed(1)}%`,
      },
      {
        accessorKey: 'avgCompletionHours',
        header: 'Avg completion (h)',
        cell: (c) => {
          const v = c.getValue() as number | null
          return v == null ? '—' : v.toFixed(1)
        },
      },
      {
        accessorKey: 'avgProgressPct',
        header: 'Avg progress %',
        cell: (c) => {
          const v = c.getValue() as number | null
          return v == null ? '—' : `${v.toFixed(1)}%`
        },
      },
    ],
    [],
  )

  return (
    <DataTable
      scope="reports.playthrough"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'awarded', desc: true }]}
      density="compact"
      emptyMessage="No bonus awards in this date range."
    />
  )
}
