'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// docs/09 §3.7 — versioned-terms banner.
//
// We poll `/api/player/terms` once on mount per shell render and show a
// dismissible-but-blocking-on-money-actions banner if the player has
// any outstanding acceptance. The banner self-hides as soon as every
// outstanding row is accepted; the player can also explicitly view
// each document via a future "Read more" route (placeholder for now).

type Slug = 'tos' | 'privacy'

interface Outstanding {
  slug: Slug
  currentVersion: number
  title: string
  summary: string | null
}

interface ApiResponse {
  outstanding: Outstanding[]
}

export function TermsBanner() {
  const router = useRouter()
  const [outstanding, setOutstanding] = useState<Outstanding[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/player/terms', { credentials: 'same-origin' })
        if (!res.ok) return
        const json = (await res.json()) as ApiResponse
        if (!cancelled) setOutstanding(json.outstanding)
      } catch {
        if (!cancelled) setOutstanding([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!outstanding || outstanding.length === 0) return null

  function acceptAll() {
    setError(null)
    startTransition(async () => {
      try {
        for (const o of outstanding ?? []) {
          const res = await fetch('/api/player/terms/accept', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: o.slug, version: o.currentVersion }),
            credentials: 'same-origin',
          })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(j?.error ?? `HTTP ${res.status}`)
          }
        }
        setOutstanding([])
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save acceptance.')
      }
    })
  }

  const slugLabel: Record<Slug, string> = {
    tos: 'Terms of Service',
    privacy: 'Privacy Policy',
  }

  return (
    <div className="border-b border-amber-700/30 bg-amber-950/30 px-4 py-3">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <div className="font-medium text-amber-100">
            Updated {outstanding.map((o) => slugLabel[o.slug]).join(' & ')}
          </div>
          <div className="text-xs text-amber-200/80">
            {outstanding[0]?.summary
              ? outstanding[0].summary
              : 'Please review and accept to continue making deposits or redemptions.'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error ? <span className="text-xs text-red-300">{error}</span> : null}
          <button
            type="button"
            disabled={pending}
            onClick={acceptAll}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'I accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
