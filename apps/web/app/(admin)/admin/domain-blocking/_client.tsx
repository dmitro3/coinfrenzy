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

// Loose client-side guard. Server-side Zod is the authoritative check.
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

const REASON_PRESETS = [
  'Disposable email service',
  'Aliased forwarder — abuse risk',
  'Fake-identity service — abuse risk',
  'High-anonymity provider — manual review',
  'Competitor domain',
  'Fraud / chargeback history',
] as const

interface AddDomainDialogProps {
  trigger: React.ReactNode
}

export function AddDomainDialog({ trigger }: AddDomainDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [domain, setDomain] = React.useState('')
  const [reason, setReason] = React.useState<string>(REASON_PRESETS[0])
  const [customReason, setCustomReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const useCustom = reason === '__custom__'
  const finalReason = (useCustom ? customReason : reason).trim()
  const cleanedDomain = domain.trim().toLowerCase()
  const domainValid = DOMAIN_RE.test(cleanedDomain)
  const canSubmit = !busy && domainValid && finalReason.length >= 1

  function reset() {
    setDomain('')
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
      const res = await fetch('/api/admin/blocked-domains', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: cleanedDomain, reason: finalReason }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? `Request failed (${res.status})`)
        return
      }
      reset()
      setOpen(false)
      // Server-rendered list — a refresh is the simplest way to see the new row.
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
            <DialogTitle>Block an email domain</DialogTitle>
            <DialogDescription>
              New signups using this domain will be refused. Adding an already-blocked domain
              updates its reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="dom">Domain</Label>
            <Input
              id="dom"
              autoComplete="off"
              autoFocus
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            {domain.length > 0 && !domainValid ? (
              <p className="text-xs text-red-500">
                Enter a bare hostname like <code className="font-mono">tempmail.com</code> — no @,
                no scheme, no path.
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
              {busy ? 'Blocking…' : 'Block domain'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface RemoveDomainButtonProps {
  domain: string
}

/**
 * Master-only inline "Remove" affordance. Surfaces a confirmation dialog
 * requiring a justification — the API enforces both.
 */
export function RemoveDomainButton({ domain }: RemoveDomainButtonProps) {
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
      const res = await fetch(`/api/admin/blocked-domains/${encodeURIComponent(domain)}`, {
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
            <DialogTitle>Remove block on {domain}</DialogTitle>
            <DialogDescription>
              Signups using this domain will be accepted again. The action is audit-logged with the
              justification below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="just">Justification</Label>
            <Input
              id="just"
              autoFocus
              placeholder="e.g. False positive — confirmed legitimate provider"
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
              {busy ? 'Removing…' : 'Remove block'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
