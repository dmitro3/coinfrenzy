'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'

// Inline row actions for the campaigns table. Cancellable statuses get a
// "Cancel" button with a confirm dialog; clone is always available.

const CANCELLABLE = new Set(['draft', 'scheduled', 'sending', 'paused'])

interface Props {
  campaignId: string
  status: string
}

export function CampaignRowActions({ campaignId, status }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const canCancel = CANCELLABLE.has(status)

  async function onCancel() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${campaignId}/cancel`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? `Failed (${res.status})`)
        return
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/admin/crm/campaigns/new?clone=${campaignId}`}
        title="Clone this campaign as a new draft"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-line-subtle px-2 text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
      >
        <Copy className="h-3 w-3" />
        Clone
      </Link>
      {canCancel ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Cancel this campaign"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-line-subtle px-2 text-xs text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="h-3 w-3" />
          Cancel
        </button>
      ) : (
        <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-tertiary">
          <MoreHorizontal className="h-3 w-3" />
        </span>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel campaign?</DialogTitle>
            <DialogDescription>
              Pending recipients will be skipped. Already-sent messages are unaffected. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? <div className="text-sm text-rose-400">{error}</div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={onCancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
