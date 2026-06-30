'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../lib/utils'
import { GameTile, type GameTileData } from './GameTile'

interface GameRailProps {
  title: string
  /** When set, renders a "See All" link next to the title. */
  seeAllHref?: string
  games: GameTileData[]
  currency?: 'GC' | 'SC'
  className?: string
}

export function GameRail({ title, seeAllHref, games, currency, className }: GameRailProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = React.useState(false)
  const [canRight, setCanRight] = React.useState(false)

  const update = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 2)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [update, games.length])

  const nudge = React.useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' })
  }, [])

  if (games.length === 0) return null

  return (
    <section className={cn('mt-8', className)}>
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          {title}
          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className="text-xs font-semibold text-[var(--cf-gold-light)] hover:text-[var(--cf-gold-medium)]"
            >
              See All
            </Link>
          ) : null}
        </h2>
        <div className="flex items-center gap-1.5">
          <RailArrow direction="left" disabled={!canLeft} onClick={() => nudge(-1)} />
          <RailArrow direction="right" disabled={!canRight} onClick={() => nudge(1)} />
        </div>
      </div>

      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 top-0 z-[1] hidden h-full w-full max-w-[6.0625rem] bg-[linear-gradient(90deg,rgba(10,10,10,0)_0%,rgba(10,10,10,1)_95.64%)] md:block md:max-w-[13.125rem]"
        />
        <div
          ref={scrollerRef}
          className={cn(
            'relative overflow-x-auto overflow-y-visible pt-3',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          <div className="-ml-2 flex touch-pan-y touch-pinch-zoom py-2.5 sm:-ml-4 2xl:-ml-[1.875rem]">
            {games.map((g) => (
              <div
                key={g.slug}
                className={cn(
                  'min-w-0 shrink-0 pl-2 sm:pl-4 2xl:pl-[1.875rem]',
                  'basis-[calc(100%/3)] xs:basis-[calc(100%/3.5)] lg:basis-[calc(100%/4.5)] xl:basis-[calc(100%/6.5)] 2xl:basis-[calc(100%/7)]',
                )}
              >
                <GameTile game={g} currency={currency} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function RailArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md border transition-colors',
        'border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-white',
        'hover:border-[var(--cf-gold-medium)] hover:text-[var(--cf-gold-light)]',
        'disabled:cursor-not-allowed disabled:opacity-30',
        'disabled:hover:border-[var(--cf-border-default)] disabled:hover:text-white',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
