'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'

import { StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

const SOURCE_TONE: Record<string, StatusPillTone> = {
  bounce: 'notice',
  complaint: 'critical',
  manual: 'neutral',
  unsubscribe: 'neutral',
  tcpa_stop: 'critical',
}

export interface SuppressionRow {
  emailOrPhone: string
  reason: string
  source: string
  addedAtIso: string
}

function AddTrigger({ canAdd }: { canAdd: boolean }) {
  const [open, setOpen] = React.useState(false)
  if (!canAdd) {
    return (
      <Button disabled title="Requires manager or master role">
        <Plus className="mr-1 h-4 w-4" /> Add entry
      </Button>
    )
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add entry
      </Button>
      <AddDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (n: boolean) => void }) {
  const router = useRouter()
  const [emailOrPhone, setEmailOrPhone] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [source, setSource] = React.useState<
    'manual' | 'bounce' | 'complaint' | 'unsubscribe' | 'tcpa_stop'
  >('manual')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setEmailOrPhone('')
      setReason('')
      setSource('manual')
      setError(null)
    }
  }, [open])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/email-center/suppression', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailOrPhone: emailOrPhone.trim().toLowerCase(),
          reason: reason.trim(),
          source,
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'failed')
        return
      }
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add suppression entry</DialogTitle>
          <DialogDescription>
            Suppresses future marketing to this address. Reason is shown to anyone reviewing the
            audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="sup-key" className="text-xs uppercase tracking-wide text-ink-tertiary">
              Email or phone (E.164)
            </Label>
            <Input
              id="sup-key"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder="user@example.com"
              className="font-mono"
            />
          </div>
          <div>
            <Label
              htmlFor="sup-reason"
              className="text-xs uppercase tracking-wide text-ink-tertiary"
            >
              Reason
            </Label>
            <Input
              id="sup-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Player asked to be removed via support ticket #1234"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-ink-tertiary">Source</Label>
            <select
              value={source}
              onChange={(e) =>
                setSource(
                  e.target.value as 'manual' | 'bounce' | 'complaint' | 'unsubscribe' | 'tcpa_stop',
                )
              }
              className="h-9 w-full rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
            >
              <option value="manual">Manual</option>
              <option value="unsubscribe">Unsubscribe</option>
              <option value="bounce">Bounce</option>
              <option value="complaint">Complaint</option>
              <option value="tcpa_stop">TCPA stop</option>
            </select>
          </div>
          {error ? <div className="text-sm text-rose-300">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || emailOrPhone.trim().length === 0 || reason.trim().length === 0}
          >
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Table({ rows, canRemove }: { rows: SuppressionRow[]; canRemove: boolean }) {
  const [removeTarget, setRemoveTarget] = React.useState<SuppressionRow | null>(null)

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line-subtle bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
            <th className="px-4 py-2">Address</th>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2">Reason</th>
            <th className="px-4 py-2">Added</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.emailOrPhone} className="border-b border-line-subtle last:border-b-0">
              <td className="px-4 py-3 font-mono text-xs text-ink-primary">{r.emailOrPhone}</td>
              <td className="px-4 py-3">
                <StatusPill
                  status="custom"
                  color={SOURCE_TONE[r.source] ?? 'neutral'}
                  label={r.source}
                />
              </td>
              <td className="px-4 py-3 text-sm text-ink-secondary">{r.reason}</td>
              <td className="px-4 py-3 text-xs text-ink-tertiary">
                {new Date(r.addedAtIso).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </td>
              <td className="px-4 py-3 text-right">
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(r)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-700/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                ) : (
                  <span className="text-xs text-ink-tertiary">master only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <RemoveDialog target={removeTarget} onClose={() => setRemoveTarget(null)} />
    </>
  )
}

function RemoveDialog({ target, onClose }: { target: SuppressionRow | null; onClose: () => void }) {
  const router = useRouter()
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!target) {
      setReason('')
      setError(null)
    }
  }, [target])

  async function submit() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/email-center/suppression/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailOrPhone: target.emailOrPhone,
          reason: reason.trim(),
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'failed')
        return
      }
      onClose()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove suppression entry</DialogTitle>
          <DialogDescription>
            Removing a bounce/complaint/TCPA stop can cause sending to a known-bad address. Provide
            a clear justification — it is logged.
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-rose-700/40 bg-rose-950/20 px-3 py-2 text-rose-200">
              <div className="font-mono text-xs">{target.emailOrPhone}</div>
              <div className="text-xs text-ink-tertiary">
                Source: {target.source} · Reason: {target.reason}
              </div>
            </div>
            <div>
              <Label
                htmlFor="rm-reason"
                className="text-xs uppercase tracking-wide text-ink-tertiary"
              >
                Removal justification (required)
              </Label>
              <Input
                id="rm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Player called support; bounce was transient"
              />
            </div>
            {error ? <div className="text-sm text-rose-300">{error}</div> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || reason.trim().length < 3}>
            {busy ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const SuppressionClient = {
  AddTrigger,
  Table,
}
