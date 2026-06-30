'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

import { formatMoney } from '../_shared.client'

export interface CohortRow {
  cohortWeek: string
  cohortSize: number
  weekActive: number
  retainedPct: number
  cohortPaying: number
  payingPct: number
  cohortDepositUsd: string
}

export function UsersDailyTable({ rows }: { rows: CohortRow[] }) {
  const columns = React.useMemo<ColumnDef<CohortRow, unknown>[]>(
    () => [
      { accessorKey: 'cohortWeek', header: 'Cohort week' },
      {
        accessorKey: 'cohortSize',
        header: 'Cohort size',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'weekActive',
        header: 'Active 7d',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'retainedPct',
        header: 'Retained %',
        cell: (c) => `${(c.getValue() as number).toFixed(1)}%`,
      },
      {
        accessorKey: 'cohortPaying',
        header: 'Paying',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'payingPct',
        header: 'Paying %',
        cell: (c) => `${(c.getValue() as number).toFixed(1)}%`,
      },
      {
        accessorKey: 'cohortDepositUsd',
        header: 'Total purchases ($)',
        cell: (c) => `$${formatMoney(c.getValue() as string)}`,
      },
    ],
    [],
  )

  return (
    <DataTable
      scope="reports.users-daily"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'cohortWeek', desc: true }]}
      density="compact"
      emptyMessage="No cohort data — players table is empty."
    />
  )
}
