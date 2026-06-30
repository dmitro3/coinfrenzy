'use client'

import * as React from 'react'
import { AlertCircle, Gift } from 'lucide-react'

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

// M4 — host send-bonus modal. Limited to templates marked
// `bonuses.host_available = true`. Server enforces the weekly cap; the UI
// previews remaining budget so the host doesn't burn a click.

export interface HostBonusTemplate {
  id: string
  displayName: string
  description: string | null
  awardSc: string // minor units, stringified
  awardGc: string
}

interface SendBonusModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerId: string
  playerLabel: string
  templates: HostBonusTemplate[]
  /** Remaining SC budget (minor units, stringified). */
  remainingSc: string
  /** Weekly cap SC for tooltip + cap message. */
  capSc: string
  /** Endpoint to POST to. Default: /api/admin/host/bonus */
  endpoint?: string
  onSent?: () => void
}

export function SendBonusModal({
  open,
  onOpenChange,
  playerId,
  playerLabel,
  templates,
  remainingSc,
  capSc,
  endpoint = '/api/admin/host/bonus',
  onSent,
}: SendBonusModalProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setSelectedId(templates[0]?.id ?? null)
      setNote('')
      setError(null)
    }
  }, [open, templates])

  const selected = templates.find((t) => t.id === selectedId)
  const wouldExceed = selected ? BigInt(selected.awardSc) > BigInt(remainingSc) : false

  async function submit() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId,
          bonusId: selected.id,
          note: note.trim() || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; reason?: string }
      if (!res.ok) {
        throw new Error(data.reason ?? data.error ?? `Request failed (${res.status})`)
      }
      onSent?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send bonus</DialogTitle>
          <DialogDescription>
            Award a host-available template to <span className="font-medium">{playerLabel}</span>.
            Remaining weekly budget:{' '}
            <span className="font-medium text-attention">{formatSc(remainingSc)}</span> SC of{' '}
            {formatSc(capSc)} SC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">Choose a template</Label>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {templates.length === 0 ? (
                <p className="rounded-md border border-line-subtle bg-surface px-3 py-3 text-sm text-ink-tertiary">
                  No host-available bonus templates configured. Ask a master to enable some.
                </p>
              ) : (
                templates.map((t) => {
                  const exceeds = BigInt(t.awardSc) > BigInt(remainingSc)
                  const isSelected = selectedId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={
                        'flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ' +
                        (isSelected
                          ? 'border-brand bg-brand-bg'
                          : 'border-line-subtle hover:border-line-default hover:bg-surface-hover')
                      }
                    >
                      <Gift
                        className={
                          'mt-0.5 h-4 w-4 shrink-0 ' +
                          (isSelected ? 'text-brand' : 'text-ink-tertiary')
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-primary">{t.displayName}</p>
                        {t.description ? (
                          <p className="mt-0.5 text-xs text-ink-tertiary">{t.description}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums text-ink-primary">
                          {formatSc(t.awardSc)} SC
                        </p>
                        {exceeds ? (
                          <p className="mt-0.5 text-[11px] font-medium text-critical">
                            Over weekly cap
                          </p>
                        ) : null}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="bonus-note" className="text-sm">
              Personal note (optional)
            </Label>
            <textarea
              id="bonus-note"
              className="mt-2 w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
              rows={3}
              placeholder="Optional message recorded with the interaction log."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {wouldExceed ? (
            <div className="flex items-start gap-2 rounded-md bg-attention-bg px-3 py-2 text-xs text-attention">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                This award exceeds your remaining weekly budget for this player. Contact your
                manager to award more, or pick a smaller template.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !selected || wouldExceed}>
            {submitting ? 'Sending…' : 'Send bonus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatSc(minor: string): string {
  try {
    const v = BigInt(minor)
    const major = v / 10000n
    const cents = (v % 10000n) / 100n
    return cents > 0n ? `${major}.${cents.toString().padStart(2, '0')}` : `${major}`
  } catch {
    return '0'
  }
}
