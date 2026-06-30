'use client'

import * as React from 'react'
import { Ban, Plus, Trash2 } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'

export interface BlockedCodeRow {
  code: string
  reason: string
  addedAt: string
}

export interface DomainBlockRow {
  id: string
  domain: string
  code: string
  promoCodeId: string
  updatedAt: string
}

export function RestrictionsPanel({
  blockedCodes,
  domainBlocks,
  canManage,
}: {
  blockedCodes: BlockedCodeRow[]
  domainBlocks: DomainBlockRow[]
  canManage: boolean
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function unblockCode(code: string) {
    if (!confirm(`Allow ${code} to be redeemed again?`)) return
    setBusy(code)
    try {
      const res = await fetch(`/api/admin/promo-codes/blocked-codes/${encodeURIComponent(code)}`, {
        method: 'DELETE',
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

  async function removeDomainBlock(row: DomainBlockRow) {
    if (!confirm(`Stop blocking ${row.domain} from ${row.code}?`)) return
    setBusy(row.id)
    try {
      // Fetch the current code's blocked domain list, drop this one, write
      // back via PATCH. Keeps the API surface tight (one endpoint per
      // resource).
      const next = domainBlocks
        .filter((d) => d.code === row.code && d.domain !== row.domain)
        .map((d) => d.domain)
      const res = await fetch(`/api/admin/promo-codes/${row.promoCodeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blockedEmailDomains: next.length > 0 ? next : null }),
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

  return (
    <div className="space-y-6">
      {/* Hard-blocked codes section */}
      <Card>
        <CardContent className="p-0">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hard-blocked codes
              </p>
              <h3 className="text-sm font-medium">
                Kills redemption immediately — even if the row in Active is enabled.
              </h3>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Block code
              </Button>
            )}
          </header>
          {blockedCodes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No codes are currently hard-blocked.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Blocked</th>
                  {canManage && <th className="px-4 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {blockedCodes.map((r) => (
                  <tr
                    key={r.code}
                    className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3 font-mono text-ink-primary">{r.code}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">{r.reason}</td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {new Date(r.addedAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === r.code}
                          onClick={() => unblockCode(r.code)}
                        >
                          Unblock
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Per-code domain blocks */}
      <Card>
        <CardContent className="p-0">
          <header className="border-b px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Per-code domain blocks
            </p>
            <h3 className="text-sm font-medium">
              Anti-abuse: throwaway-mail domains the bonus engine refuses on specific codes.
            </h3>
          </header>
          {domainBlocks.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No per-code domain blocks. Add them under each code&apos;s Advanced section.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Domain</th>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Updated</th>
                  {canManage && <th className="px-4 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {domainBlocks.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3 font-mono text-ink-primary">@{r.domain}</td>
                    <td className="px-4 py-3 font-mono text-ink-secondary">{r.code}</td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === r.id}
                          onClick={() => removeDomainBlock(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <BlockCodeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

function BlockCodeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [code, setCode] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setCode('')
      setReason('')
      setError(null)
    }
  }, [open])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/promo-codes/blocked-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), reason: reason.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? `Failed (${res.status})`)
        setSubmitting(false)
        return
      }
      onOpenChange(false)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hard-block a promo code</DialogTitle>
          <DialogDescription>
            Use this when a code has leaked or is being abused. Blocks take effect immediately, even
            if the code is still set to Active.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABUSE25"
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label>Reason (audit-logged)</Label>
            <textarea
              className="border-input bg-background min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Leaked on coupon-aggregator site / multi-account abuse / etc."
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || code.trim().length < 3 || reason.trim().length < 2}
            variant="destructive"
          >
            <Ban className="h-3.5 w-3.5" />
            {submitting ? 'Blocking…' : 'Block code'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
