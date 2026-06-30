'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'

interface Row {
  emailOrPhone: string
  reason: string
  source: string
  addedAt: string
}

interface Props {
  /** Manager+ can add entries to the suppression list (docs/11 §7.4). */
  canManage: boolean
  /** Master-only can remove entries (docs/11 §7.2). */
  canDelete: boolean
  rows: Row[]
}

export function SuppressionAdmin({ canManage, canDelete, rows }: Props) {
  const router = useRouter()
  const [target, setTarget] = React.useState('')
  const [reason, setReason] = React.useState('manual')
  const [busy, setBusy] = React.useState(false)
  const [removeBusy, setRemoveBusy] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)

  async function add(): Promise<void> {
    if (!target.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/admin/crm/suppression', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: target.trim(), reason, source: 'manual' }),
      })
      if (res.ok) {
        setTarget('')
        router.refresh()
        return
      }
      const e = (await res.json().catch(() => ({}))) as { error?: string }
      setErr(e.error ?? 'failed')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(emailOrPhone: string): Promise<void> {
    if (!canDelete) return
    if (!window.confirm(`Remove ${emailOrPhone} from suppression?`)) return
    setRemoveBusy(emailOrPhone)
    try {
      const res = await fetch(
        `/api/admin/crm/suppression?emailOrPhone=${encodeURIComponent(emailOrPhone)}`,
        { method: 'DELETE' },
      )
      if (res.ok) router.refresh()
    } finally {
      setRemoveBusy('')
    }
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">Add to suppression list</div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs">
              <div className="text-muted-foreground">Email or phone (E.164)</div>
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="user@example.com or +15551234567"
                className="w-72"
              />
            </label>
            <label className="space-y-1 text-xs">
              <div className="text-muted-foreground">Reason</div>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="manual">manual</option>
                <option value="hard_bounce">hard_bounce</option>
                <option value="spam_complaint">spam_complaint</option>
                <option value="stop_keyword">stop_keyword</option>
                <option value="opt_out">opt_out</option>
              </select>
            </label>
            <Button onClick={add} disabled={busy || !target.trim()}>
              {busy ? 'Adding…' : 'Suppress'}
            </Button>
            {err ? <span className="text-xs text-rose-600">{err}</span> : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          Adding entries to the suppression list requires the manager or master role. Ask your
          manager to add a recipient on your behalf.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Email / phone</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No suppressions.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.emailOrPhone + r.addedAt} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{r.emailOrPhone}</td>
                  <td className="px-4 py-3">{r.reason}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.source}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.addedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={!canDelete || removeBusy === r.emailOrPhone}
                      onClick={() => remove(r.emailOrPhone)}
                      className={`text-xs underline ${
                        canDelete
                          ? 'text-rose-600 hover:text-rose-700'
                          : 'cursor-not-allowed text-muted-foreground'
                      }`}
                    >
                      {removeBusy === r.emailOrPhone
                        ? 'Removing…'
                        : canDelete
                          ? 'Remove'
                          : 'Master only'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
