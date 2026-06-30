'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit3, Eye, EyeOff, GripVertical, Layers, Plus, Save, Trash2, X } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { StatusPill } from '@coinfrenzy/ui/admin'

interface Row {
  id: string
  slug: string
  displayName: string
  type: string
  thumbnailUrl: string | null
  ordering: number
  status: string
  inLobby: boolean
  isFeatured: boolean
  gameCount: number
  createdAt: string
  updatedAt: string
}

interface Props {
  initialRows: Row[]
}

const TYPE_OPTIONS = ['originals', 'slots', 'live-dealers', 'game-shows', 'live-games', 'other']

export function SubCategoriesClient({ initialRows }: Props) {
  const router = useRouter()
  const [rows, setRows] = React.useState<Row[]>(initialRows)
  const [savingOrder, setSavingOrder] = React.useState(false)
  const [editing, setEditing] = React.useState<Row | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const orderDirty = React.useMemo(
    () => rows.some((r, idx) => initialRows[idx]?.id !== r.id),
    [rows, initialRows],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === active.id)
      const j = prev.findIndex((r) => r.id === over.id)
      if (i === -1 || j === -1) return prev
      return arrayMove(prev, i, j)
    })
  }

  const onSaveOrder = async () => {
    setSavingOrder(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/casino/sub-categories/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedIds: rows.map((r) => r.id) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'save_failed')
        return
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setSavingOrder(false)
    }
  }

  const toggleInLobby = async (row: Row) => {
    const res = await fetch(`/api/admin/casino/sub-categories/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inLobby: !row.inLobby }),
    })
    if (res.ok) router.refresh()
  }

  const onDelete = async (row: Row) => {
    if (!window.confirm(`Delete "${row.displayName}"? Games stay in the catalog.`)) return
    const res = await fetch(`/api/admin/casino/sub-categories/${row.id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-surface px-4 py-3">
        <div className="text-sm text-ink-secondary">
          {rows.length} sections · drag to reorder · click{' '}
          <span className="font-medium">View games</span> to add or remove
        </div>
        <div className="flex items-center gap-2">
          {orderDirty ? (
            <Button size="sm" variant="outline" onClick={onSaveOrder} disabled={savingOrder}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {savingOrder ? 'Saving…' : 'Save order'}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New category
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-critical/30 bg-critical/10 px-4 py-2 text-sm text-critical">
          {error}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <Layers className="h-8 w-8 text-ink-tertiary" />
              <div className="text-sm text-ink-tertiary">
                No categories yet. Create one to start arranging the lobby.
              </div>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New category
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-line-subtle">
                  {rows.map((r, idx) => (
                    <SortableRow
                      key={r.id}
                      row={r}
                      index={idx}
                      onEdit={() => setEditing(r)}
                      onToggleLobby={() => toggleInLobby(r)}
                      onDelete={() => onDelete(r)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <EditDrawer
          row={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function SortableRow({
  row,
  index,
  onEdit,
  onToggleLobby,
  onDelete,
}: {
  row: Row
  index: number
  onEdit: () => void
  onToggleLobby: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-surface px-4 py-3 hover:bg-surface-hover"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-ink-tertiary hover:text-ink-primary active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-8 text-right text-xs tabular-nums text-ink-tertiary">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink-primary">{row.displayName}</span>
          {row.isFeatured ? <StatusPill status="custom" color="notice" label="Featured" /> : null}
          {row.status !== 'active' ? (
            <StatusPill status="custom" color="neutral" label={row.status} />
          ) : null}
          {!row.inLobby ? (
            <StatusPill status="custom" color="attention" label="Hidden from lobby" />
          ) : null}
        </div>
        <div className="truncate text-xs text-ink-tertiary">
          <span className="font-mono">{row.slug}</span> · {row.type}
        </div>
      </div>
      <span className="text-xs tabular-nums text-ink-tertiary">{row.gameCount} games</span>
      <Link
        href={`/admin/casino/sub-categories/${row.id}/games`}
        className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-elevated hover:text-ink-primary"
      >
        View games
      </Link>
      <button
        type="button"
        onClick={onToggleLobby}
        title={row.inLobby ? 'Hide from lobby' : 'Show in lobby'}
        className="rounded-md p-1.5 text-ink-tertiary hover:bg-elevated hover:text-ink-primary"
      >
        {row.inLobby ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onEdit}
        title="Edit"
        className="rounded-md p-1.5 text-ink-tertiary hover:bg-elevated hover:text-ink-primary"
      >
        <Edit3 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        className="rounded-md p-1.5 text-ink-tertiary hover:bg-critical/15 hover:text-critical"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  )
}

function EditDrawer({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null
  onClose: () => void
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = React.useState(row?.displayName ?? '')
  const [slug, setSlug] = React.useState(row?.slug ?? '')
  const [type, setType] = React.useState(row?.type ?? 'slots')
  const [thumbnailUrl, setThumbnailUrl] = React.useState(row?.thumbnailUrl ?? '')
  const [inLobby, setInLobby] = React.useState(row?.inLobby ?? true)
  const [isFeatured, setIsFeatured] = React.useState(row?.isFeatured ?? false)
  const [status, setStatus] = React.useState<'active' | 'inactive'>(
    (row?.status as 'active' | 'inactive') ?? 'active',
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isCreate = row === null

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        displayName,
        type,
        thumbnailUrl: thumbnailUrl.trim() === '' ? null : thumbnailUrl.trim(),
        inLobby,
        isFeatured,
        status,
      }
      const res = isCreate
        ? await fetch('/api/admin/casino/sub-categories', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug, ...payload }),
          })
        : await fetch(`/api/admin/casino/sub-categories/${row.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'save_failed')
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line-subtle px-5 py-3">
          <div className="text-base font-semibold text-ink-primary">
            {isCreate ? 'New sub-category' : `Edit ${row.displayName}`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-md border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical">
              {error}
            </div>
          ) : null}

          <Field label="Display name" required>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={120}
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary focus:border-line-default focus:outline-none"
            />
          </Field>

          <Field
            label="Slug"
            hint="Lowercase, hyphens. Used in URLs and player-side category mapping."
            required={isCreate}
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              required={isCreate}
              disabled={!isCreate}
              maxLength={64}
              pattern="[a-z0-9][a-z0-9-]*"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 font-mono text-sm text-ink-primary focus:border-line-default focus:outline-none disabled:opacity-60"
            />
          </Field>

          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary focus:border-line-default focus:outline-none"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Thumbnail URL (optional)">
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://…"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </Field>

          <Field label="Visibility">
            <div className="flex flex-col gap-2 text-sm text-ink-secondary">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inLobby}
                  onChange={(e) => setInLobby(e.target.checked)}
                  className="h-4 w-4 accent-positive"
                />
                Show in lobby (visible to players)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="h-4 w-4 accent-positive"
                />
                Featured section
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={status === 'active'}
                  onChange={(e) => setStatus(e.target.checked ? 'active' : 'inactive')}
                  className="h-4 w-4 accent-positive"
                />
                Active
              </label>
            </div>
          </Field>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" onClick={onSubmit} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </Button>
        </footer>
      </aside>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-secondary">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-ink-tertiary">{hint}</span> : null}
    </label>
  )
}
