'use client'

import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'
import { Badge } from '@coinfrenzy/ui/primitives/badge'

export interface AuditRow {
  id: string
  actorKind: string
  actorId: string | null
  actorRole: string | null
  action: string
  resourceKind: string | null
  resourceId: string | null
  ip: string | null
  occurredAt: string
  reason: string | null
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const columns = React.useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        id: 'occurredAt',
        accessorKey: 'occurredAt',
        header: 'When',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {new Date(row.original.occurredAt).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'actor',
        accessorFn: (r) => `${r.actorKind} ${r.actorRole ?? ''} ${r.actorId ?? ''}`,
        header: 'Actor',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="flex items-center gap-1">
              <Badge variant="outline" className="font-mono text-[10px]">
                {row.original.actorKind}
              </Badge>
              {row.original.actorRole ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {row.original.actorRole}
                </span>
              ) : null}
            </span>
            {row.original.actorId ? (
              <span className="font-mono text-[10px] text-muted-foreground">
                {row.original.actorId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'action',
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
      },
      {
        id: 'resource',
        accessorFn: (r) => `${r.resourceKind ?? ''} ${r.resourceId ?? ''}`,
        header: 'Resource',
        cell: ({ row }) =>
          row.original.resourceKind ? (
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-muted-foreground">
                {row.original.resourceKind}
              </span>
              {row.original.resourceId ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {row.original.resourceId.slice(0, 8)}…
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'ip',
        accessorKey: 'ip',
        header: 'IP',
        cell: ({ row }) =>
          row.original.ip ? (
            <span className="font-mono text-[11px] text-muted-foreground">{row.original.ip}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        header: 'Reason',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.reason ?? '—'}</span>
        ),
      },
    ],
    [],
  )

  return (
    <DataTable
      columns={columns}
      data={rows}
      scope="audit_log"
      defaultSort={[{ id: 'occurredAt', desc: true }]}
      globalFilterPlaceholder="Search audit entries…"
      density="compact"
      emptyMessage="No audit entries yet."
    />
  )
}
