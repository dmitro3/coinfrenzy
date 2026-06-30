'use client'

import * as React from 'react'

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

// Server-side Zod is the authoritative check; this just keeps the UI honest.
const CODE_RE = /^[A-Z0-9_-]{2,40}$/

const REASON_PRESETS = [
  'Internal staff use only',
  'Reserved for QA testing',
  'Reserved for partner program',
  'Leaked publicly — disabled',
  'Linked to fraud campaign',
  'Used by chargebacking accounts',
] as const

interface BlockCodeDialogProps {
  trigger: React.ReactNode
}

export function BlockCodeDialog({ trigger }: BlockCodeDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [reason, setReason] = React.useState<string>(REASON_PRESETS[0])
  const [customReason, setCustomReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const useCustom = reason === '__custom__'
  const finalReason = (useCustom ? customReason : reason).trim()
  const cleanCode = code.trim().toUpperCase()
  const codeValid = CODE_RE.test(cleanCode)
  const canSubmit = !busy && codeValid && finalReason.length >= 1

  function reset() {
    setCode('')
    setReason(REASON_PRESETS[0])
    setCustomReason('')
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/blocked-promo-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, reason: finalReason }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? `Request failed (${res.status})`)
        return
      }
      reset()
      setOpen(false)
      if (typeof window !== 'undefined') window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Block a promo code</DialogTitle>
            <DialogDescription>
              The bonus engine will refuse this code outright on any redemption attempt. Adding an
              already-blocked code updates its reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              autoComplete="off"
              autoFocus
              placeholder="FRAUDFIVE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={40}
              className="font-mono"
            />
            {code.length > 0 && !codeValid ? (
              <p className="text-xs text-red-500">
                2–40 chars. Letters, numbers, hyphen, underscore only.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reasonSel">Reason</Label>
            <select
              id="reasonSel"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__custom__">Custom reason…</option>
            </select>
            {useCustom ? (
              <Input
                placeholder="Short justification (shown in the audit log)"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={200}
              />
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Blocking…' : 'Block code'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface RemovePromoCodeButtonProps {
  code: string
}

export function RemovePromoCodeButton({ code }: RemovePromoCodeButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [justification, setJustification] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (justification.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/blocked-promo-codes/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ justification: justification.trim() }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? `Request failed (${res.status})`)
        return
      }
      setOpen(false)
      if (typeof window !== 'undefined') window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setJustification('')
          setError(null)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-tertiary transition-colors hover:text-red-500"
      >
        Remove
      </button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Re-enable code {code}</DialogTitle>
            <DialogDescription>
              The bonus engine will accept this code again. The action is audit-logged with the
              justification below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="just">Justification</Label>
            <Input
              id="just"
              autoFocus
              placeholder="e.g. Promo campaign ended — safe to release"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              maxLength={500}
            />
          </div>
          {error ? (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || justification.trim().length < 3}
            >
              {busy ? 'Removing…' : 'Re-enable'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
