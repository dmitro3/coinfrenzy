'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { CurrentTerms, TermsSlug } from '@coinfrenzy/core/legal'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

const SLUG_LABEL: Record<TermsSlug, string> = {
  tos: 'Terms of Service',
  privacy: 'Privacy Policy',
  rg_policy: 'Responsible Gaming Policy',
}

interface Props {
  current: {
    tos: CurrentTerms | null
    privacy: CurrentTerms | null
    rg: CurrentTerms | null
  }
  history: CurrentTerms[]
  canPublishStandard: boolean
  canPublishRg: boolean
}

export function TermsManagerClient({ current, history, canPublishStandard, canPublishRg }: Props) {
  const [activeSlug, setActiveSlug] = useState<TermsSlug>('tos')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')

  const canPublish = (slug: TermsSlug) => (slug === 'rg_policy' ? canPublishRg : canPublishStandard)

  function submit() {
    setError(null)
    if (!canPublish(activeSlug)) {
      setError('You do not have permission to publish this policy.')
      return
    }
    if (!title.trim() || !bodyHtml.trim()) {
      setError('Title and body are required.')
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/admin/terms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: activeSlug,
          title: title.trim(),
          summary: summary.trim() || undefined,
          bodyHtml,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? `HTTP ${res.status}`)
        return
      }
      setTitle('')
      setSummary('')
      setBodyHtml('')
      router.refresh()
    })
  }

  const filteredHistory = history.filter((h) => h.slug === activeSlug)
  const cur = current[activeSlug === 'rg_policy' ? 'rg' : activeSlug]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {(['tos', 'privacy', 'rg_policy'] as TermsSlug[]).map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => setActiveSlug(slug)}
                className={
                  'rounded-md px-3 py-1.5 text-xs font-medium transition ' +
                  (activeSlug === slug
                    ? 'bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/40'
                    : 'bg-line-subtle text-ink-secondary hover:bg-line-subtle/60')
                }
              >
                {SLUG_LABEL[slug]}
              </button>
            ))}
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-ink-tertiary">Current version</div>
            {cur ? (
              <div className="rounded-md border border-line-subtle bg-surface-2 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-primary">{cur.title}</span>
                  <span className="text-ink-tertiary">v{cur.version}</span>
                </div>
                {cur.summary ? <div className="mt-2 text-ink-tertiary">{cur.summary}</div> : null}
                <div className="mt-2 text-ink-tertiary">
                  effective {new Date(cur.effectiveAt).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="text-ink-tertiary">No version published yet.</div>
            )}
          </div>

          <div className="border-t border-line-subtle pt-4">
            <div className="mb-2 text-sm font-medium text-ink-primary">Publish a new version</div>
            {!canPublish(activeSlug) ? (
              <div className="text-xs text-amber-300">
                {activeSlug === 'rg_policy'
                  ? 'Only Master can publish the RG policy.'
                  : 'You need Manager or Master to publish.'}
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <label className="block text-xs">
                  <span className="text-ink-tertiary">Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    className="mt-1 w-full rounded border border-line-subtle bg-surface-2 px-2 py-1.5 text-sm text-ink-primary"
                    placeholder={`${SLUG_LABEL[activeSlug]} v${(cur?.version ?? 0) + 1}`}
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-ink-tertiary">Summary (shown in banner)</span>
                  <input
                    type="text"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    maxLength={500}
                    className="mt-1 w-full rounded border border-line-subtle bg-surface-2 px-2 py-1.5 text-sm text-ink-primary"
                    placeholder="What's new in this version"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-ink-tertiary">Body (HTML)</span>
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={10}
                    className="mt-1 w-full rounded border border-line-subtle bg-surface-2 px-2 py-1.5 font-mono text-xs text-ink-primary"
                    placeholder="<p>Full document body...</p>"
                  />
                </label>
                {error ? <div className="text-xs text-red-400">{error}</div> : null}
                <div className="flex items-center justify-end gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Publishing…' : `Publish v${(cur?.version ?? 0) + 1}`}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="text-sm font-medium text-ink-primary">
            History · {SLUG_LABEL[activeSlug]}
          </div>
          {filteredHistory.length === 0 ? (
            <div className="text-xs text-ink-tertiary">No history yet.</div>
          ) : (
            <ul className="space-y-2 text-xs">
              {filteredHistory.map((h) => (
                <li key={h.id} className="rounded border border-line-subtle bg-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-primary">v{h.version}</span>
                    <span className="text-ink-tertiary">
                      {new Date(h.effectiveAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-ink-secondary">{h.title}</div>
                  {h.summary ? <div className="mt-1 text-ink-tertiary">{h.summary}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
