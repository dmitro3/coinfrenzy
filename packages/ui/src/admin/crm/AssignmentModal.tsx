'use client'

import * as React from 'react'

import { Button } from '../../primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../primitives/dialog'
import { Label } from '../../primitives/label'

// M4 — Master/manager modal for assigning VIPs to hosts. Single-player or
// bulk modes — caller passes player IDs.

export interface HostOption {
  id: string
  displayName: string
  vipCount?: number
}

interface AssignmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerIds: string[]
  hosts: HostOption[]
  /** Endpoint that accepts {playerIds, hostId}. */
  endpoint?: string
  onAssigned?: () => void
}

export function AssignmentModal({
  open,
  onOpenChange,
  playerIds,
  hosts,
  endpoint = '/api/admin/host/assign',
  onAssigned,
}: AssignmentModalProps) {
  const [hostId, setHostId] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setHostId(hosts[0]?.id ?? null)
      setReason('')
      setError(null)
    }
  }, [open, hosts])

  async function submit() {
    if (!hostId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerIds,
          hostId,
          reason: reason.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      onAssigned?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to host</DialogTitle>
          <DialogDescription>
            {playerIds.length === 1
              ? 'Assign 1 player to the selected host.'
              : `Assign ${playerIds.length} players to the selected host.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">Host</Label>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {hosts.length === 0 ? (
                <p className="rounded-md border border-line-subtle bg-surface px-3 py-3 text-sm text-ink-tertiary">
                  No active hosts. Create a host account first.
                </p>
              ) : (
                hosts.map((h) => {
                  const selected = hostId === h.id
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHostId(h.id)}
                      className={
                        'flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ' +
                        (selected
                          ? 'border-brand bg-brand-bg'
                          : 'border-line-subtle hover:border-line-default hover:bg-surface-hover')
                      }
                    >
                      <span className="text-sm font-medium text-ink-primary">{h.displayName}</span>
                      {h.vipCount != null ? (
                        <span className="text-xs text-ink-tertiary">
                          {h.vipCount} {h.vipCount === 1 ? 'VIP' : 'VIPs'}
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="assignment-reason" className="text-sm">
              Reason (optional, logged to audit)
            </Label>
            <textarea
              id="assignment-reason"
              className="mt-2 w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
              rows={2}
              placeholder="Why this assignment?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !hostId || playerIds.length === 0}>
            {submitting ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
