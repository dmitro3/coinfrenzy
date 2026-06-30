'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { GripVertical, Save } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'
import { StatusPill } from '@coinfrenzy/ui/admin'

interface SectionOption {
  id: string
  slug: string
  displayName: string
  gameCount: number
}

interface GameRow {
  id: string
  slug: string
  displayName: string
  providerName: string
  status: string
  customerFacing: boolean
  rtp: string | null
}

interface Props {
  sections: SectionOption[]
  activeSectionId: string | null
  games: GameRow[]
}

export function GamesReorderClient({ sections, activeSectionId, games }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [list, setList] = React.useState<GameRow[]>(games)
  const [search, setSearch] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setList(games)
  }, [games])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onSectionChange = (id: string) => {
    const next = sections.find((s) => s.id === id)
    if (!next) return
    const params = new URLSearchParams(sp?.toString() ?? '')
    params.set('subCategory', next.slug)
    router.push(`?${params.toString()}`)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setList((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const onSave = async () => {
    if (!activeSectionId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/casino/sub-categories/${activeSectionId}/games/reorder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedGameIds: list.map((g) => g.id) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'save_failed')
        return
      }
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setSaving(false)
    }
  }

  const filteredView = React.useMemo(() => {
    if (search.trim() === '') return list
    const q = search.toLowerCase()
    return list.filter(
      (g) => g.displayName.toLowerCase().includes(q) || g.providerName.toLowerCase().includes(q),
    )
  }, [list, search])

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sub-category</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ul className="flex flex-col">
            {sections.map((s) => {
              const active = s.id === activeSectionId
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSectionChange(s.id)}
                    className={
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ' +
                      (active
                        ? 'bg-elevated text-ink-primary'
                        : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary')
                    }
                  >
                    <span className="truncate">{s.displayName}</span>
                    <span className="ml-2 shrink-0 text-xs text-ink-tertiary">{s.gameCount}</span>
                  </button>
                </li>
              )
            })}
            {sections.length === 0 ? (
              <li className="px-3 py-2 text-xs text-ink-tertiary">No sub-categories yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
          <CardTitle className="text-base">
            {sections.find((s) => s.id === activeSectionId)?.displayName ?? 'No section selected'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="h-8 w-44 rounded-md border border-line-subtle bg-surface px-2 text-xs text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
            <Button size="sm" onClick={onSave} disabled={saving || !activeSectionId}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save order'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="border-b border-line-subtle bg-critical/10 px-4 py-2 text-xs text-critical">
              {error}
            </div>
          ) : null}
          {savedAt ? (
            <div className="border-b border-line-subtle bg-positive/10 px-4 py-2 text-xs text-positive">
              Saved.
            </div>
          ) : null}
          {filteredView.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
              {search.trim() !== ''
                ? 'No games match the filter.'
                : 'No games in this section yet — add some on the Sub Categories page.'}
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={filteredView.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="divide-y divide-line-subtle">
                  {filteredView.map((g, idx) => (
                    <SortableRow
                      key={g.id}
                      game={g}
                      index={list.findIndex((x) => x.id === g.id)}
                      displayIndex={idx}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SortableRow({
  game,
  index,
  displayIndex,
}: {
  game: GameRow
  index: number
  displayIndex: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: game.id,
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
      className="flex items-center gap-3 bg-surface px-3 py-2 hover:bg-surface-hover"
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
        <div className="truncate text-sm font-medium text-ink-primary">{game.displayName}</div>
        <div className="truncate text-xs text-ink-tertiary">
          {game.providerName}
          {game.rtp ? ` · ${(Number(game.rtp) * 100).toFixed(1)}% RTP` : ''}
        </div>
      </div>
      {game.status === 'active' ? (
        <StatusPill status="active" />
      ) : (
        <StatusPill status="custom" color="neutral" label={game.status} />
      )}
      {!game.customerFacing ? (
        <StatusPill status="custom" color="attention" label="Hidden" />
      ) : null}
      <span className="text-xs tabular-nums text-ink-tertiary">#{displayIndex + 1}</span>
    </li>
  )
}
