'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Pencil, Trash2 } from 'lucide-react'

import { StatusPill } from '@coinfrenzy/ui/admin'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'

export interface PageRowLite {
  id: string
  slug: string
  title: string
  category: string | null
  status: 'active' | 'draft' | 'archived'
  audience: string | null
  bodyExcerpt: string
  version: number
  updatedAtLabel: string
}

interface PagesPanelProps {
  rows: PageRowLite[]
  canEdit: boolean
}

const STATUS_TONE: Record<PageRowLite['status'], 'positive' | 'notice' | 'neutral'> = {
  active: 'positive',
  draft: 'notice',
  archived: 'neutral',
}

export function PagesPanel({ rows, canEdit }: PagesPanelProps) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = React.useState<PageRowLite | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function doDelete() {
    if (!confirmDelete) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cms/pages/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Request failed.')
        return
      }
      setConfirmDelete(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Audience</th>
              <th className="px-4 py-2">Version</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/cms/${r.id}`}
                    className="font-medium text-ink-primary hover:underline"
                  >
                    {r.title}
                  </Link>
                  {r.bodyExcerpt ? (
                    <div className="mt-0.5 line-clamp-1 text-xs text-ink-tertiary">
                      {r.bodyExcerpt}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{r.slug}</td>
                <td className="px-4 py-3 text-xs text-ink-secondary">
                  {r.category ?? <span className="text-ink-tertiary">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-ink-secondary">
                  {r.audience ?? <span className="text-ink-tertiary">public</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums text-ink-secondary">
                  v{r.version}
                </td>
                <td className="px-4 py-3 text-xs text-ink-secondary">{r.updatedAtLabel}</td>
                <td className="px-4 py-3">
                  <StatusPill status="custom" color={STATUS_TONE[r.status]} label={r.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={`/p/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View live"
                      className="rounded-md border border-line-subtle p-1.5 text-ink-secondary hover:bg-surface-hover"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                    <Link
                      href={`/admin/cms/${r.id}`}
                      aria-label="Edit"
                      className="rounded-md border border-line-subtle p-1.5 text-ink-secondary hover:bg-surface-hover"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    {canEdit && r.status !== 'archived' ? (
                      <button
                        type="button"
                        aria-label="Archive"
                        onClick={() => {
                          setError(null)
                          setConfirmDelete(r)
                        }}
                        className="rounded-md border border-line-subtle p-1.5 text-critical hover:bg-critical/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmDelete(null)
            setError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive page</DialogTitle>
            <DialogDescription>
              Archive <span className="font-semibold">{confirmDelete?.title}</span>? The page will
              stop rendering at <span className="font-mono">/p/{confirmDelete?.slug}</span> but the
              row stays in the database so you can un-archive it later.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
              {error}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              Archive page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
