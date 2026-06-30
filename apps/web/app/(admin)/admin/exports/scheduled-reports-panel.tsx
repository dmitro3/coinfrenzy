'use client'

import * as React from 'react'

import { Badge } from '@coinfrenzy/ui/primitives/badge'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'

export interface SubscriptionRow {
  id: string
  reportKind: string
  schedule: string
  emailTo: string[]
  emailSubject: string | null
  enabled: boolean
  lastSentAt: string | null
  nextDueAt: string | null
  createdAt: string
}

const REPORT_KINDS = [
  { value: 'daily_summary', label: 'Daily summary' },
  { value: 'weekly_summary', label: 'Weekly summary' },
  { value: 'monthly_summary', label: 'Monthly summary' },
  { value: 'affiliate_payout_due', label: 'Affiliate payouts due' },
] as const

export function ScheduledReportsPanel({
  initialRows,
  defaultRecipient,
}: {
  initialRows: SubscriptionRow[]
  defaultRecipient: string
}) {
  const [rows, setRows] = React.useState<SubscriptionRow[]>(initialRows)
  const [reportKind, setReportKind] = React.useState<string>('daily_summary')
  const [schedule, setSchedule] = React.useState<string>('0 9 * * *')
  const [emailTo, setEmailTo] = React.useState<string>(defaultRecipient)
  const [busy, setBusy] = React.useState(false)

  async function refresh() {
    const r = await fetch('/api/admin/report-subscriptions', { cache: 'no-store' })
    if (r.ok) {
      const j = (await r.json()) as { rows: SubscriptionRow[] }
      setRows(j.rows)
    }
  }

  async function create() {
    setBusy(true)
    try {
      const recipients = emailTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const r = await fetch('/api/admin/report-subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportKind, schedule, emailTo: recipients }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        window.alert(`Failed: ${(j as { error?: string }).error ?? r.status}`)
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch(`/api/admin/report-subscriptions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    await refresh()
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this subscription?')) return
    await fetch(`/api/admin/report-subscriptions/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Scheduled reports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
          <label className="space-y-1 lg:col-span-3">
            <span className="text-xs text-muted-foreground">Kind</span>
            <select
              value={reportKind}
              onChange={(e) => setReportKind(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {REPORT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 lg:col-span-3">
            <span className="text-xs text-muted-foreground">Cron schedule (UTC)</span>
            <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </label>
          <label className="space-y-1 lg:col-span-5">
            <span className="text-xs text-muted-foreground">
              Email recipients (comma-separated)
            </span>
            <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
          </label>
          <div className="flex items-end lg:col-span-1">
            <Button onClick={create} disabled={busy}>
              {busy ? '…' : 'Add'}
            </Button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Kind
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Schedule
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Recipients
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Last sent
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Next due
                </th>
                <th className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-2 py-1 text-right font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                    No subscriptions yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-2 py-1 capitalize">{r.reportKind.replace(/_/g, ' ')}</td>
                    <td className="px-2 py-1 font-mono">{r.schedule}</td>
                    <td className="px-2 py-1">{r.emailTo.join(', ')}</td>
                    <td className="px-2 py-1 font-mono">
                      {r.lastSentAt ? new Date(r.lastSentAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-2 py-1 font-mono">
                      {r.nextDueAt ? new Date(r.nextDueAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant={r.enabled ? 'default' : 'outline'}>
                        {r.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggle(r.id, !r.enabled)}>
                        {r.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
