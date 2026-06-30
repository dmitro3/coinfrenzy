'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'

export function AleaFindingActions({ findingId }: { findingId: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function resolve(action: 'resolved' | 'ignored') {
    setPending(true)
    setError(null)
    const notes = window.prompt(
      action === 'resolved'
        ? 'Resolution notes (e.g. "Replayed manually via games.replayMissedRound", required):'
        : 'Reason for ignoring (required):',
    )
    if (!notes) {
      setPending(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/integrity/alea/findings/${findingId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve('resolved')}>
        Resolve
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve('ignored')}>
        Ignore
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  )
}
