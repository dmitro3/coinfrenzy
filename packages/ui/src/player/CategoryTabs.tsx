'use client'

import * as React from 'react'
import Link from 'next/link'
import { Mic2, Radio, Users, Zap } from 'lucide-react'

import { cn } from '../lib/utils'
import { PLAYER_CATEGORIES, type PlayerCategorySlug } from './player-categories-data'

// Re-export the data + type so existing barrel imports keep working.
export { PLAYER_CATEGORIES }
export type { PlayerCategorySlug }

// Five-tab category strip from the live site. Each tab shows an icon,
// the label in tracking-wide caps, and a small dark count badge. The
// active tab gets a gold gradient background. Renders as anchor tags so
// it works server-side and the URL is the source of truth.
//
// The slug + label data lives in `./player-categories-data.ts` (no
// `'use client'`) so server components can import the list without
// Turbopack wrapping it as a client-reference proxy. Icons live here
// because they're React components and only the client needs them.

const CATEGORY_ICONS: Record<PlayerCategorySlug, React.ComponentType<{ className?: string }>> = {
  originals: Zap,
  slots: SlotMachineIcon,
  'live-dealers': Users,
  'game-shows': Mic2,
  'live-games': Radio,
}

function SlotMachineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </svg>
  )
}

interface CategoryTabsProps {
  activeSlug?: PlayerCategorySlug | null
  counts: Partial<Record<PlayerCategorySlug, number>>
  basePath?: string
  className?: string
}

export function CategoryTabs({
  activeSlug,
  counts,
  basePath = '/casino-games',
  className,
}: CategoryTabsProps) {
  return (
    <nav
      aria-label="Game categories"
      className={cn(
        // Mobile (and tablet up to lg): single horizontal scroll row,
        // each pill chunky and full-comfort-height. Matches the live
        // coinfrenzy.com mobile pattern where pills overflow off the
        // right edge and you swipe to see more — never the squashed
        // 2-column wrap grid we had before.
        //
        // The negative margin + matching padding extends the scroll
        // track past the page gutter so the first/last pills can
        // "tuck" under the edge as you scroll, the way native lists
        // do. Native scrollbar hidden (arrows + touch are the controls).
        'cf-player-scroll-bleed flex items-center gap-2.5 overflow-x-auto pb-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Desktop (≥lg) where space is plentiful — allow the row to
        // wrap naturally (no horizontal scroll needed when 5 pills
        // fit easily on one line). The wider gap reads cleaner on a
        // wide canvas without the bigger touch targets we need on
        // mobile.
        'lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0',
        className,
      )}
    >
      {PLAYER_CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat.slug]
        const count = counts[cat.slug] ?? 0
        const active = activeSlug === cat.slug
        return (
          <Link
            key={cat.slug}
            href={`${basePath}?category=${cat.slug}`}
            prefetch
            className={cn(
              // shrink-0 stops the pill from collapsing inside the
              // overflow-x scroll track. The chunkier h-11 / px-4 gives
              // a proper 44px+ touch target and matches the live site's
              // chip proportions. `whitespace-nowrap` prevents the
              // "GAME / SHOWS" two-line break when the count badge
              // gets wide.
              'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4',
              'text-xs font-bold uppercase tracking-[0.14em] transition-colors',
              active
                ? 'cf-gold-gradient text-[#1a1a1a] shadow-[0_2px_10px_rgba(204,153,51,0.3)]'
                : 'border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-[var(--cf-gray-light)] hover:border-[var(--cf-gold-medium)] hover:text-white',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {cat.label}
            <span
              className={cn(
                'ml-0.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums',
                active ? 'bg-black/30 text-[#1a1a1a]' : 'bg-black/60 text-white',
              )}
            >
              {count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
