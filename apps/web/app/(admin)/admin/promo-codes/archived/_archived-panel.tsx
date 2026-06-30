'use client'

import * as React from 'react'
import { Undo2 } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'

export interface ArchivedRow {
  id: string
  code: string
  description: string | null
  bonusName: string
  usesCount: number
  validUntil: string | null
  updatedAt: string
}

export function ArchivedPanel({ rows, canManage }: { rows: ArchivedRow[]; canManage: boolean }) {
  const [busy, setBusy] = React.useState<string | null>(null)

  async function restore(row: ArchivedRow) {
    if (
      !confirm(
        `Restore ${row.code} to active? Players will be able to redeem it again if the validity window allows.`,
      )
    )
      return
    setBusy(row.id)
    try {
      const res = await fetch(`/api/admin/promo-codes/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        alert(body.error ?? `Failed (${res.status})`)
        return
      }
      window.location.reload()
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Undo2 />}
            title="No archived codes"
            description="Codes you archive from the active page will appear here."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Bonus</th>
              <th className="px-4 py-2">Lifetime uses</th>
              <th className="px-4 py-2">Expired</th>
              <th className="px-4 py-2">Archived</th>
              <th className="px-4 py-2">Status</th>
              {canManage && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-3">
                  <div className="font-mono text-ink-primary">{r.code}</div>
                  {r.description && (
                    <div className="truncate text-xs text-ink-tertiary">{r.description}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-secondary">{r.bonusName}</td>
                <td className="px-4 py-3 tabular-nums text-ink-primary">
                  {r.usesCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-ink-secondary">
                  {r.validUntil ? new Date(r.validUntil).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-ink-tertiary">
                  {new Date(r.updatedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status="custom" color="neutral" label="Archived" />
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === r.id}
                      onClick={() => restore(r)}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
