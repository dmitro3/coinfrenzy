'use client'

import * as React from 'react'

import { Badge } from '@coinfrenzy/ui/primitives/badge'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'

export interface ExportListRow {
  id: string
  exportType: string
  status: string
  rowCount: number | null
  sizeBytes: string | null
  downloadUrl: string | null
  expiresAt: string | null
  requiresReview: boolean
  reviewedAt: string | null
  createdAt: string
  completedAt: string | null
}

// Grouped types make the dropdown legible as the list grows.
// Keep value strings in sync with the API enum in /api/admin/exports/route.ts
// and the core ExportType union in packages/core/src/reports/exports.ts.
const PRESET_GROUPS = [
  {
    label: 'Money & players',
    options: [
      { value: 'players', label: 'Players' },
      { value: 'purchases', label: 'Purchases' },
      { value: 'redemptions', label: 'Redemptions' },
      { value: 'bonuses_awarded', label: 'Bonuses awarded' },
      { value: 'wallets_snapshot', label: 'Wallets — current snapshot' },
      { value: 'ledger_entries', label: 'Ledger entries' },
    ],
  },
  {
    label: 'Marketing',
    options: [
      { value: 'promo_redemptions', label: 'Promo code redemptions' },
      { value: 'crm_message_log', label: 'CRM message log' },
      { value: 'affiliates', label: 'Affiliates' },
    ],
  },
  {
    label: 'Operations & compliance',
    options: [
      { value: 'daily_kpis', label: 'Daily KPIs' },
      { value: 'audit_log', label: 'Audit log' },
      { value: 'kyc_status', label: 'KYC status — snapshot' },
      { value: 'tier_history', label: 'Tier history' },
    ],
  },
  {
    label: 'Casino',
    options: [{ value: 'game_rounds', label: 'Game rounds' }],
  },
] as const

// Snapshot exports ignore the From/To inputs — surface that in the UI.
const SNAPSHOT_TYPES = new Set(['wallets_snapshot', 'kyc_status', 'affiliates'])

function formatSize(bytesStr: string | null): string {
  if (!bytesStr) return '—'
  const n = Number(bytesStr)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function ExportCenterClient({ initialRows }: { initialRows: ExportListRow[] }) {
  const [rows, setRows] = React.useState<ExportListRow[]>(initialRows)
  const [busy, setBusy] = React.useState(false)
  const [exportType, setExportType] = React.useState<string>('daily_kpis')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [reason, setReason] = React.useState('')

  async function refresh() {
    const r = await fetch('/api/admin/exports', { cache: 'no-store' })
    if (r.ok) {
      const j = (await r.json()) as { rows: ExportListRow[] }
      setRows(j.rows)
    }
  }

  // Poll every 5 seconds when there are pending/running exports so the UI
  // updates without a hard refresh. Stops when nothing is in flight.
  const pendingCount = rows.filter((r) => r.status === 'pending' || r.status === 'running').length
  React.useEffect(() => {
    if (pendingCount === 0) return
    const t = setInterval(() => {
      void refresh()
    }, 5_000)
    return () => clearInterval(t)
  }, [pendingCount])

  const isSnapshot = SNAPSHOT_TYPES.has(exportType)

  async function start() {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { exportType }
      const filter: Record<string, unknown> = {}
      // Snapshot exports ignore date filters by design — don't even send them.
      if (!isSnapshot) {
        if (from) filter.fromDate = from
        if (to) filter.toDate = to
      }
      if (Object.keys(filter).length > 0) body.filter = filter
      if (reason.trim()) body.reason = reason.trim()

      const r = await fetch('/api/admin/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        window.alert(`Export failed: ${(j as { error?: string }).error ?? r.status}`)
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <CardHeader>
          <CardTitle className="text-sm">New export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Type
            </span>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {PRESET_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {isSnapshot ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Snapshot export — captures the current state of the table. Date range does not apply.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">From</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">To</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Reason (optional)</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Audit context — what's this export for?"
            />
          </label>
          <Button onClick={start} disabled={busy}>
            {busy ? 'Queueing…' : 'Start export'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Exports run in the background. The download link is emailed when ready and stays valid
            for 24 hours.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-7">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Recent exports</span>
            <Button variant="outline" size="sm" onClick={refresh}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Type
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-2 py-1 text-right font-medium uppercase tracking-wider text-muted-foreground">
                  Rows
                </th>
                <th className="px-2 py-1 text-right font-medium uppercase tracking-wider text-muted-foreground">
                  Size
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Created
                </th>
                <th className="px-2 py-1 text-right font-medium uppercase tracking-wider text-muted-foreground">
                  Download
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                    No exports yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-2 py-1 capitalize">{r.exportType.replace(/_/g, ' ')}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {r.rowCount?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {formatSize(r.sizeBytes)}
                    </td>
                    <td className="px-2 py-1 font-mono">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {r.downloadUrl && r.status === 'complete' ? (
                        <a
                          href={r.downloadUrl}
                          download={`coinfrenzy-${r.exportType}-${r.id}.csv`}
                          className="text-primary hover:underline"
                        >
                          download
                        </a>
                      ) : r.status === 'expired' ? (
                        <span className="text-muted-foreground" title="Link TTL elapsed">
                          expired
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    status === 'complete'
      ? 'default'
      : status === 'failed'
        ? 'destructive'
        : status === 'expired'
          ? 'outline'
          : 'secondary'
  return <Badge variant={variant}>{status}</Badge>
}
