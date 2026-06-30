'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { SegmentBuilder, type FilterGroup } from '@coinfrenzy/ui/admin/crm'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'

interface Props {
  segmentId?: string | null
  initialName?: string
  initialDescription?: string
  initialTree?: FilterGroup
}

export function SegmentEditor({
  segmentId = null,
  initialName = '',
  initialDescription = '',
  initialTree,
}: Props) {
  const router = useRouter()
  const [name, setName] = React.useState(initialName)
  const [description, setDescription] = React.useState(initialDescription)
  const treeRef = React.useRef<FilterGroup>(initialTree ?? { operator: 'AND', conditions: [] })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)

  async function save() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = segmentId ? `/api/admin/crm/segments/${segmentId}` : `/api/admin/crm/segments`
      const method = segmentId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          filterTree: treeRef.current,
          status: 'active',
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        setError(json.error ?? `Save failed (${res.status})`)
        return
      }
      const data = (await res.json()) as { segment?: { id?: string } }
      setSavedAt(new Date())
      if (!segmentId && data.segment?.id) {
        router.push(`/admin/crm/segments/${data.segment.id}`)
      } else {
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Whales — top 5%"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what this segment captures"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <SegmentBuilder
        initialTree={treeRef.current}
        onChange={(next) => {
          treeRef.current = next
        }}
      />

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line-subtle bg-surface/95 p-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : segmentId ? 'Save changes' : 'Save segment'}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/crm/segments">Cancel</Link>
        </Button>
        {savedAt ? (
          <span className="text-xs text-positive">Saved {savedAt.toLocaleTimeString()}</span>
        ) : null}
        {error ? <span className="text-xs text-rose-400">Error: {error}</span> : null}
      </div>
    </div>
  )
}
