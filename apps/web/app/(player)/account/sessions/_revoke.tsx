'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'

export function RevokeButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function revoke() {
    if (!confirm('Sign this device out?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/player/sessions/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={revoke} disabled={busy}>
      {busy ? '…' : 'Revoke'}
    </Button>
  )
}
