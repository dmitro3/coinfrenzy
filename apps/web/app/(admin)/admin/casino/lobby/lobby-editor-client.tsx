'use client'

import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Save,
  Search,
  X,
} from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { StatusPill } from '@coinfrenzy/ui/admin'

// docs/08 §4.3 — Game Lobby WYSIWYG editor. The admin sees one rail
// per casino_sub_category, in section ordering, and each rail shows the
// games in their per-section ordering. Sections are drag-reorderable;
// games within a section are drag-reorderable. `Save layout` PUTs the
// whole arrangement in one shot via /api/admin/casino/lobby/layout.

export interface LobbyEditorGame {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  thumbnailUrl: string | null
  isNew: boolean
  isFeatured: boolean
  status: string
  customerFacing: boolean
}

export interface LobbyEditorSection {
  id: string
  slug: string
  displayName: string
  inLobby: boolean
  status: string
  games: LobbyEditorGame[]
}

export interface LobbyEditorAvailableGame {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  status: string
  customerFacing: boolean
  isFeatured: boolean
  isNew: boolean
}

interface Props {
  initialSections: LobbyEditorSection[]
  availableGames: LobbyEditorAvailableGame[]
}

export function LobbyEditorClient({ initialSections, availableGames }: Props) {
  const [sections, setSections] = React.useState<LobbyEditorSection[]>(initialSections)
  const [drawerSectionId, setDrawerSectionId] = React.useState<string | null>(null)
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  // Track the last successfully-saved snapshot so `dirty` resets after save.
  // Using a ref avoids an extra render cycle; the comparison already happens
  // inside useMemo which reads sections state.
  const savedSectionsRef = React.useRef<LobbyEditorSection[]>(initialSections)

  const dirty = React.useMemo(
    () => JSON.stringify(sections) !== JSON.stringify(savedSectionsRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, savedAt], // savedAt changes when savedSectionsRef is updated
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Drag IDs are composed so the DndContext can tell sections apart from
  // games. `section:<id>` for a section header, `game:<sectionId>:<gameId>`
  // for a game tile. That gives every draggable a globally-unique id and
  // lets the drop handler infer where the move belongs.

  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    if (activeId.startsWith('section:') && overId.startsWith('section:')) {
      const a = activeId.slice('section:'.length)
      const b = overId.slice('section:'.length)
      setSections((prev) => {
        const i = prev.findIndex((s) => s.id === a)
        const j = prev.findIndex((s) => s.id === b)
        if (i === -1 || j === -1) return prev
        return arrayMove(prev, i, j)
      })
      return
    }

    if (activeId.startsWith('game:') && overId.startsWith('game:')) {
      const [, sIdA, gIdA] = activeId.split(':')
      const [, sIdB, gIdB] = overId.split(':')
      if (sIdA !== sIdB) return // games can only be reordered within a section here
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sIdA) return s
          const i = s.games.findIndex((g) => g.id === gIdA)
          const j = s.games.findIndex((g) => g.id === gIdB)
          if (i === -1 || j === -1) return s
          return { ...s, games: arrayMove(s.games, i, j) }
        }),
      )
    }
  }

  const removeGame = (sectionId: string, gameId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, games: s.games.filter((g) => g.id !== gameId) } : s,
      ),
    )
  }

  const addGamesToSection = (sectionId: string, gameIds: string[]) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const existing = new Set(s.games.map((g) => g.id))
        const next = [...s.games]
        for (const gid of gameIds) {
          if (existing.has(gid)) continue
          const meta = availableGames.find((a) => a.id === gid)
          if (!meta) continue
          next.push({
            id: meta.id,
            slug: meta.slug,
            displayName: meta.displayName,
            providerName: meta.providerName,
            providerSlug: meta.providerSlug,
            thumbnailUrl: null,
            isNew: meta.isNew,
            isFeatured: meta.isFeatured,
            status: meta.status,
            customerFacing: meta.customerFacing,
          })
        }
        return { ...s, games: next }
      }),
    )
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/casino/lobby/layout', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sections: sections.map((s) => ({
            id: s.id,
            gameIds: s.games.map((g) => g.id),
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'save_failed')
        return
      }
      savedSectionsRef.current = sections
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setSaving(false)
    }
  }

  const activeDragGame = React.useMemo(() => {
    if (!activeDragId || !activeDragId.startsWith('game:')) return null
    const [, sId, gId] = activeDragId.split(':')
    return sections.find((s) => s.id === sId)?.games.find((g) => g.id === gId) ?? null
  }, [activeDragId, sections])

  const drawerSection = drawerSectionId ? sections.find((s) => s.id === drawerSectionId) : null

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <span className="font-medium text-ink-primary">{sections.length} sections</span>
          <span className="text-ink-tertiary">·</span>
          <span>
            {sections.reduce((a, s) => a + s.games.length, 0).toLocaleString()} games placed
          </span>
          {dirty ? (
            <span className="ml-2 inline-flex items-center rounded bg-attention/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-attention">
              Unsaved changes
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/lobby"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview as player
          </a>
          <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save layout'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-critical/30 bg-critical/10 px-4 py-2 text-sm text-critical">
          {error}
        </div>
      ) : null}
      {savedAt && !dirty ? (
        <div className="rounded-md border border-positive/30 bg-positive/10 px-4 py-2 text-sm text-positive">
          Layout saved.
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={sections.map((s) => `section:${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <SectionRail
                key={section.id}
                section={section}
                onAddGames={() => setDrawerSectionId(section.id)}
                onRemoveGame={(gameId) => removeGame(section.id, gameId)}
              />
            ))}
            {sections.length === 0 ? (
              <div className="rounded-md border border-dashed border-line-subtle bg-surface px-6 py-10 text-center text-sm text-ink-tertiary">
                No sections yet. Create one on the Sub Categories page to start arranging the lobby.
              </div>
            ) : null}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeDragGame ? (
            <div className="rounded-md border border-line-default bg-surface px-3 py-2 shadow-lg">
              <div className="text-sm font-medium text-ink-primary">
                {activeDragGame.displayName}
              </div>
              <div className="text-xs text-ink-tertiary">{activeDragGame.providerName}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {drawerSection ? (
        <AddGamesDrawer
          section={drawerSection}
          availableGames={availableGames}
          onClose={() => setDrawerSectionId(null)}
          onAdd={(ids) => {
            addGamesToSection(drawerSection.id, ids)
            setDrawerSectionId(null)
          }}
        />
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Section rail                                                               */
/* -------------------------------------------------------------------------- */

function SectionRail({
  section,
  onAddGames,
  onRemoveGame,
}: {
  section: LobbyEditorSection
  onAddGames: () => void
  onRemoveGame: (gameId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${section.id}`,
  })

  // Ref for the horizontal scroll container so arrow buttons can scroll it
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-line-subtle bg-surface"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-ink-tertiary hover:text-ink-primary active:cursor-grabbing"
            aria-label="Drag to reorder section"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-semibold text-ink-primary">{section.displayName}</h3>
          <span className="text-xs text-ink-tertiary">
            {section.games.length} game{section.games.length === 1 ? '' : 's'}
          </span>
          {!section.inLobby ? <StatusPill status="custom" color="neutral" label="Hidden" /> : null}
          {section.status !== 'active' ? (
            <StatusPill status="custom" color="attention" label={section.status} />
          ) : null}
        </div>
        {/* Right side: scroll arrows + add games button */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line-subtle bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-40"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line-subtle bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-40"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button size="sm" variant="outline" onClick={onAddGames} className="ml-1">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add games
          </Button>
        </div>
      </header>

      <div className="p-3">
        {section.games.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-subtle px-4 py-8 text-center text-sm text-ink-tertiary">
            No games in this rail yet. Click <span className="font-medium">Add games</span> above.
          </p>
        ) : (
          <SortableContext
            items={section.games.map((g) => `game:${section.id}:${g.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {/* Single horizontal scrollable row */}
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              {section.games.map((game) => (
                <SortableGameTile
                  key={game.id}
                  sectionId={section.id}
                  game={game}
                  onRemove={() => onRemoveGame(game.id)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </section>
  )
}

function SortableGameTile({
  sectionId,
  game,
  onRemove,
}: {
  sectionId: string
  game: LobbyEditorGame
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `game:${sectionId}:${game.id}`,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      // Fixed width so tiles render in a single row regardless of count
      className="group relative flex-none overflow-hidden rounded-md border border-line-subtle bg-elevated"
      style={{ ...style, width: '148px' }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="block w-full cursor-grab active:cursor-grabbing"
        aria-label={`Drag ${game.displayName}`}
      >
        <div className="relative aspect-[3/4] w-full bg-gradient-to-br from-violet-600 via-fuchsia-600 to-amber-500">
          {game.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.thumbnailUrl}
              alt={game.displayName}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-2xl font-bold text-white drop-shadow">
              <ImageIcon className="h-7 w-7 opacity-70" />
            </div>
          )}
          {game.isNew ? (
            <span className="absolute right-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-50">
              New
            </span>
          ) : null}
          {game.isFeatured ? (
            <span className="absolute left-1.5 top-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">
              Featured
            </span>
          ) : null}
          {!game.customerFacing ? (
            <span className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-white">
              <EyeOff className="h-3 w-3" />
              Hidden
            </span>
          ) : null}
        </div>
        <div className="px-2 py-1.5 text-left">
          <div className="truncate text-xs font-medium text-ink-primary">{game.displayName}</div>
          <div className="truncate text-[11px] text-ink-tertiary">{game.providerName}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-critical/80 group-hover:opacity-100"
        title="Remove from section"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Add-games drawer                                                           */
/* -------------------------------------------------------------------------- */

function AddGamesDrawer({
  section,
  availableGames,
  onClose,
  onAdd,
}: {
  section: LobbyEditorSection
  availableGames: LobbyEditorAvailableGame[]
  onClose: () => void
  onAdd: (gameIds: string[]) => void
}) {
  const [search, setSearch] = React.useState('')
  const [providerFilter, setProviderFilter] = React.useState('all')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const alreadyIn = React.useMemo(() => new Set(section.games.map((g) => g.id)), [section.games])

  const providerOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    availableGames.forEach((g) => map.set(g.providerSlug, g.providerName))
    return Array.from(map.entries())
      .map(([slug, name]) => ({ value: slug, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [availableGames])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return availableGames.filter((g) => {
      if (alreadyIn.has(g.id)) return false
      if (providerFilter !== 'all' && g.providerSlug !== providerFilter) return false
      if (q === '') return true
      return (
        g.displayName.toLowerCase().includes(q) ||
        g.providerName.toLowerCase().includes(q) ||
        g.slug.toLowerCase().includes(q)
      )
    })
  }, [availableGames, alreadyIn, providerFilter, search])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredIds = filtered.map((g) => g.id)
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) for (const id of allFilteredIds) next.delete(id)
      else for (const id of allFilteredIds) next.add(id)
      return next
    })
  }

  const onAddSelected = () => {
    onAdd(Array.from(selected))
  }

  const onAddProvider = () => {
    if (providerFilter === 'all') return
    onAdd(allFilteredIds)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line-subtle px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">Add games to</div>
            <div className="text-base font-semibold text-ink-primary">{section.displayName}</div>
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

        <div className="flex flex-col gap-2 border-b border-line-subtle px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-tertiary" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games or providers…"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface pl-8 pr-3 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="h-8 rounded-md border border-line-subtle bg-surface px-2 text-xs text-ink-primary focus:border-line-default focus:outline-none"
            >
              <option value="all">All providers</option>
              {providerOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {providerFilter !== 'all' ? (
              <button
                type="button"
                onClick={onAddProvider}
                className="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                title={`Add all ${allFilteredIds.length} matching games`}
              >
                Add all {allFilteredIds.length}
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleAll}
              disabled={allFilteredIds.length === 0}
              className="ml-auto rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-50"
            >
              {allSelected ? 'Clear all' : `Select all (${allFilteredIds.length})`}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-tertiary">
              No games match these filters, or all matching games are already in this section.
            </p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((g) => {
                const isSelected = selected.has(g.id)
                return (
                  <li key={g.id}>
                    <label
                      className={
                        'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ' +
                        (isSelected ? 'bg-elevated' : 'hover:bg-surface-hover')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(g.id)}
                        className="h-4 w-4 accent-positive"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink-primary">{g.displayName}</div>
                        <div className="truncate text-xs text-ink-tertiary">
                          {g.providerName}
                          {g.status !== 'active' ? ` · ${g.status}` : ''}
                          {!g.customerFacing ? ' · hidden' : ''}
                        </div>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-line-subtle px-5 py-3">
          <span className="text-xs text-ink-tertiary">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onAddSelected} disabled={selected.size === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add {selected.size > 0 ? selected.size : ''} game{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
