'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Clock, Gamepad2, Search, Sparkles, Tag, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { easings, useIsMobile } from './motion-primitives'

// docs/ux-polish-audit.md — Item 6.
//
// Spotlight is the player-side Cmd+K command palette: a centered dark
// modal with a single search input that fuzzy-matches across:
//   - games          (player games seeded from M2)
//   - providers      (Pragmatic Play, Hacksaw, etc.)
//   - pages          (lobby / cashier / account sub-routes)
// Results render as one-row tiles. Arrow keys move the cursor, Enter
// fires the result's href via the caller-supplied navigator, Esc
// closes. Last 5 queries persist in localStorage as a "recent" list,
// shown when the input is empty.
//
// Why not Radix Dialog + cmdk? The admin command palette already pulls
// cmdk in for its surface but the player chrome wants a more visually
// polished, framer-motion-driven modal with the gold-on-black brand
// system. Re-implementing the (small) keyboard logic locally keeps the
// player UI cohesive without forcing the admin / player surfaces to
// share a styling system.

export interface SearchEntry {
  id: string
  kind: 'game' | 'provider' | 'page'
  label: string
  description?: string
  href: string
  thumbnailUrl?: string | null
  category?: string
  keywords: string[]
}

interface SpotlightSearchProps {
  open: boolean
  onClose: () => void
  /** Called with the href when the player selects a result. */
  onNavigate: (href: string) => void
}

const RECENT_STORAGE_KEY = 'cf:player:spotlight:recent'
const RECENT_LIMIT = 5

// Result ordering: games first (most common need), then providers,
// then pages (utility). Used when comparing two equally-good matches.
const KIND_RANK: Record<SearchEntry['kind'], number> = {
  game: 0,
  provider: 1,
  page: 2,
}

interface Match {
  entry: SearchEntry
  score: number
}

// Simple token-based fuzzy score:
//   - exact prefix on label: +12
//   - substring in label   : +6
//   - substring in keyword : +3
//   - substring in description : +2
// Each matched token contributes its highest bucket. Kind-rank is a
// tiebreaker so games beat pages when scores are equal.
function scoreEntry(entry: SearchEntry, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const label = entry.label.toLowerCase()
  const description = entry.description?.toLowerCase() ?? ''
  const keywords = entry.keywords.map((k) => k.toLowerCase())
  let total = 0
  let allMatched = true
  for (const token of tokens) {
    let best = 0
    if (label.startsWith(token)) best = Math.max(best, 12)
    if (label.includes(token)) best = Math.max(best, 6)
    if (description.includes(token)) best = Math.max(best, 2)
    for (const k of keywords) {
      if (k.startsWith(token)) best = Math.max(best, 5)
      else if (k.includes(token)) best = Math.max(best, 3)
    }
    if (best === 0) {
      allMatched = false
      break
    }
    total += best
  }
  if (!allMatched) return 0
  // Slight kind bias.
  return total - KIND_RANK[entry.kind] * 0.1
}

function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_LIMIT)
  } catch {
    return []
  }
}

function persistRecent(value: string): void {
  if (typeof window === 'undefined') return
  if (!value.trim()) return
  try {
    const current = readRecent()
    const next = [value, ...current.filter((v) => v !== value)].slice(0, RECENT_LIMIT)
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* localStorage may be unavailable (private mode); silently skip */
  }
}

export function SpotlightSearch({ open, onClose, onNavigate }: SpotlightSearchProps) {
  const [entries, setEntries] = React.useState<SearchEntry[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [recent, setRecent] = React.useState<string[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const fetchedRef = React.useRef(false)
  // Mobile flips the modal from "centered card with 12vh top inset"
  // into "full-screen sheet from the bottom edge". Same content,
  // fatter touch targets, no awkward floating card on a 375px viewport.
  const isMobile = useIsMobile()

  // Reset query/cursor each time the dialog opens, and lazily load the
  // search index on first open so the player chrome stays light if the
  // player never touches Cmd+K.
  React.useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    setRecent(readRecent())
    // Focus the input next frame so the appear animation can run.
    const handle = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(handle)
  }, [open])

  React.useEffect(() => {
    if (!open || fetchedRef.current) return
    fetchedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/player/search-index', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { entries: SearchEntry[] }
        if (!cancelled && Array.isArray(json.entries)) setEntries(json.entries)
      } catch {
        /* tolerate failure — Spotlight just shows the empty state */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // Esc closes; arrow keys navigate. Lock body scroll while open so
  // the page behind doesn't rubber-band on iOS.
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.body.classList.add('cf-no-scroll')
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('cf-no-scroll')
    }
  }, [open, onClose])

  const tokens = React.useMemo(() => tokenize(query), [query])

  const matches: Match[] = React.useMemo(() => {
    if (!entries) return []
    if (tokens.length === 0) return []
    const scored: Match[] = []
    for (const entry of entries) {
      const score = scoreEntry(entry, tokens)
      if (score > 0) scored.push({ entry, score })
    }
    scored.sort((a, b) => b.score - a.score || KIND_RANK[a.entry.kind] - KIND_RANK[b.entry.kind])
    return scored.slice(0, 12)
  }, [entries, tokens])

  // Whenever the result-set changes, reset cursor to top.
  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const fireResult = React.useCallback(
    (entry: SearchEntry) => {
      persistRecent(query.trim())
      setRecent(readRecent())
      onClose()
      onNavigate(entry.href)
    },
    [query, onClose, onNavigate],
  )

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (matches.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = matches[activeIndex]
      if (choice) fireResult(choice.entry)
    }
  }

  // Mobile entrance: slide up from the bottom edge — same motion
  // grammar as the Shop & Rewards sheets so all three feel like
  // siblings. Desktop entrance: keep the centered card with the soft
  // settle the search palette has used since Cmd-K shipped.
  const sheetInitial = isMobile ? { y: '100%', opacity: 0 } : { y: 12, opacity: 0, scale: 0.98 }
  const sheetAnimate = isMobile ? { y: 0, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }
  const sheetExit = isMobile ? { y: '100%', opacity: 0 } : { y: 8, opacity: 0, scale: 0.98 }
  const sheetTransition = isMobile
    ? { type: 'spring' as const, stiffness: 280, damping: 30, mass: 0.95 }
    : { type: 'spring' as const, stiffness: 320, damping: 26, mass: 0.95 }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="spotlight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: easings.outCubic }}
          className={cn(
            'fixed inset-0 z-[70] bg-black/70 backdrop-blur-md',
            // Mobile sheet hugs the bottom; desktop centers in the
            // upper third (matches the established Cmd-K position).
            'grid justify-center',
            isMobile ? 'items-end' : 'items-start pt-[12vh]',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={onClose}
        >
          <motion.div
            initial={sheetInitial}
            animate={sheetAnimate}
            exit={sheetExit}
            transition={sheetTransition}
            className={cn(
              'overflow-hidden border bg-[var(--cf-bg-card)]',
              'border-[var(--cf-gold-deep)]/40 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]',
              // Mobile: full-width sheet, rounded top corners only,
              // bounded to 88vh so the OS keyboard always has room.
              isMobile
                ? 'w-full max-h-[88vh] rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]'
                : 'w-[min(640px,92vw)] rounded-xl',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {isMobile ? (
              <div className="flex justify-center pt-2">
                <span
                  aria-hidden="true"
                  className="h-1 w-10 rounded-full bg-[var(--cf-gray-light)]/30"
                />
              </div>
            ) : null}

            <div className="flex items-center gap-3 border-b border-[var(--cf-border-subtle)] px-4 py-3">
              <Search className="h-4 w-4 text-[var(--cf-gold-light)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search games, providers, or pages…"
                aria-autocomplete="list"
                aria-controls="cf-spotlight-results"
                aria-activedescendant={
                  matches[activeIndex]
                    ? `cf-spotlight-item-${matches[activeIndex].entry.id}`
                    : undefined
                }
                // `enterKeyHint=search` flips the on-screen "Return"
                // key into a magnifier on iOS/Android — small nicety
                // that signals "this is THE search field on the page".
                enterKeyHint="search"
                className="h-11 flex-1 bg-transparent text-base text-white placeholder:text-[var(--cf-gray-light)] focus:outline-none"
              />
              <kbd className="hidden rounded border border-[var(--cf-border-default)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--cf-gray-light)] md:inline">
                Esc
              </kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close search"
                className="grid h-9 w-9 place-items-center rounded text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              id="cf-spotlight-results"
              className={cn(
                'overflow-y-auto py-2',
                // On mobile the sheet should grow toward the keyboard
                // — let the results panel fill the remaining sheet
                // height instead of capping at 55vh.
                isMobile ? 'max-h-[calc(88vh-130px)]' : 'max-h-[55vh]',
              )}
            >
              {entries === null ? <LoadingRow /> : null}
              {entries !== null && tokens.length === 0 ? (
                <EmptyHints
                  recent={recent}
                  onSelect={(text) => {
                    setQuery(text)
                    setActiveIndex(0)
                  }}
                />
              ) : null}
              {entries !== null && tokens.length > 0 && matches.length === 0 ? (
                <NoResults query={query} />
              ) : null}
              {matches.map((m, i) => (
                <ResultRow
                  key={m.entry.id}
                  entry={m.entry}
                  active={i === activeIndex}
                  onClick={() => fireResult(m.entry)}
                  onMouseEnter={() => setActiveIndex(i)}
                />
              ))}
            </div>

            {/* Keyboard hints footer is desktop-only — touch users
                don't have ↑↓ to navigate, so showing them is just
                noise that eats screen real estate. */}
            {isMobile ? null : (
              <div className="flex items-center justify-between border-t border-[var(--cf-border-subtle)] bg-[var(--cf-bg-base)] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--cf-gray-light)]">
                <span>↑↓ navigate</span>
                <span>↩ open</span>
                <span>esc close</span>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

// ─── Result row ───────────────────────────────────────────────────────

function ResultRow({
  entry,
  active,
  onClick,
  onMouseEnter,
}: {
  entry: SearchEntry
  active: boolean
  onClick: () => void
  onMouseEnter: () => void
}) {
  const Icon = entry.kind === 'game' ? Gamepad2 : entry.kind === 'provider' ? Tag : Sparkles
  return (
    <button
      id={`cf-spotlight-item-${entry.id}`}
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={active}
      className={cn(
        // Mobile gets a comfy 56px row; desktop keeps the original
        // dense list density. Both use the same active/hover bg.
        'flex w-full items-center gap-3 px-4 py-3.5 text-left sm:py-2.5',
        'transition-colors duration-150',
        active ? 'bg-[#1a1305]' : 'hover:bg-[var(--cf-bg-card-hover)] active:bg-[#1a1305]',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md',
          'border border-[var(--cf-border-default)] bg-black/40 text-[var(--cf-gold-light)]',
        )}
      >
        {entry.thumbnailUrl ? (
          <img src={entry.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{entry.label}</span>
        {entry.description ? (
          <span className="block truncate text-[11px] text-[var(--cf-gray-light)]">
            {entry.description}
          </span>
        ) : null}
      </span>
      <ArrowRight
        className={cn(
          'h-4 w-4 shrink-0 transition-opacity',
          active ? 'text-[var(--cf-gold-light)] opacity-100' : 'opacity-0',
        )}
      />
    </button>
  )
}

function EmptyHints({ recent, onSelect }: { recent: string[]; onSelect: (text: string) => void }) {
  return (
    <div className="px-4 py-3">
      {recent.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--cf-gold-light)]/80">
            Recent
          </p>
          <ul className="space-y-1">
            {recent.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => onSelect(text)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm text-white hover:bg-[var(--cf-bg-card-hover)]"
                >
                  <Clock className="h-3.5 w-3.5 text-[var(--cf-gray-light)]" />
                  <span className="truncate">{text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[11px] text-[var(--cf-gray-light)]">
        Try searching for <Hint onSelect={onSelect}>slots</Hint>,{' '}
        <Hint onSelect={onSelect}>plinko</Hint>, <Hint onSelect={onSelect}>blackjack</Hint>, or{' '}
        <Hint onSelect={onSelect}>redeem</Hint>.
      </p>
    </div>
  )
}

function Hint({ children, onSelect }: { children: string; onSelect: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(children)}
      className="rounded-sm px-1 text-[var(--cf-gold-light)] hover:bg-[#1a1305]"
    >
      {children}
    </button>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-[var(--cf-gray-light)]">
      <p className="text-white">No matches for &ldquo;{query}&rdquo;</p>
      <p className="mt-1 text-[11px]">
        Try searching for slots, blackjack, or your favorite provider.
      </p>
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="space-y-1.5 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-1.5 py-1.5">
          <div className="cf-skeleton-shimmer h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <div className="cf-skeleton-shimmer h-3 w-32 rounded" />
            <div className="cf-skeleton-shimmer h-2.5 w-44 rounded opacity-70" />
          </div>
        </div>
      ))}
    </div>
  )
}
