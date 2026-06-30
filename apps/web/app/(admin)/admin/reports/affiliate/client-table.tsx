'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'

import { formatMoney } from '../_shared.client'

export interface AffiliateRow {
  id: string
  username: string
  email: string
  displayName: string | null
  status: string
  revenueSharePct: string
  totalSignups: number
  totalActive: number
  totalNgrSc: string
  totalPayoutsSc: string
  pendingPayoutSc: string
  lastPayoutAt: string | null
}

export function AffiliateReportTable({ rows }: { rows: AffiliateRow[] }) {
  const columns = React.useMemo<ColumnDef<AffiliateRow, unknown>[]>(
    () => [
      { accessorKey: 'username', header: 'Username' },
      { accessorKey: 'email', header: 'Email' },
      { accessorKey: 'displayName', header: 'Name', cell: (c) => c.getValue() ?? '—' },
      {
        accessorKey: 'revenueSharePct',
        header: 'RevShare %',
        cell: (c) => `${(Number(c.getValue() as string) * 100).toFixed(2)}%`,
      },
      {
        accessorKey: 'totalSignups',
        header: 'Signups',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'totalActive',
        header: 'Active',
        cell: (c) => (c.getValue() as number).toLocaleString(),
      },
      {
        accessorKey: 'totalNgrSc',
        header: 'NGR (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'totalPayoutsSc',
        header: 'Paid out (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'pendingPayoutSc',
        header: 'Owed (SC)',
        cell: (c) => formatMoney(c.getValue() as string),
      },
      {
        accessorKey: 'lastPayoutAt',
        header: 'Last payout',
        cell: (c) => (c.getValue() ? new Date(c.getValue() as string).toLocaleDateString() : '—'),
      },
    ],
    [],
  )

  return (
    <DataTable
      scope="reports.affiliate"
      columns={columns}
      data={rows}
      defaultSort={[{ id: 'totalNgrSc', desc: true }]}
      density="compact"
      emptyMessage="No active affiliates."
    />
  )
}
