'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'

interface Props {
  campaignId: string
  status: string
}

export function SendControls({ campaignId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<'send' | 'cancel' | null>(null)

  async function send(immediate: boolean): Promise<void> {
    setBusy('send')
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ immediate }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function cancel(): Promise<void> {
    setBusy('cancel')
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${campaignId}/cancel`, { method: 'POST' })
      if (res.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'draft' || status === 'scheduled' || status === 'paused' ? (
        <>
          <Button onClick={() => send(false)} disabled={busy !== null}>
            {busy === 'send' ? 'Working…' : 'Send now (queued)'}
          </Button>
          <Button variant="outline" onClick={() => send(true)} disabled={busy !== null}>
            Send synchronously (test only)
          </Button>
          <Button variant="destructive" onClick={cancel} disabled={busy !== null}>
            Cancel
          </Button>
        </>
      ) : null}
      {status === 'sent' ? (
        <span className="text-xs text-muted-foreground">Send completed.</span>
      ) : null}
      {status === 'cancelled' ? <span className="text-xs text-rose-600">Cancelled.</span> : null}
    </div>
  )
}
