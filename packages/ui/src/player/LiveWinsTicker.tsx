'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/utils'

// docs/10 §7 + live screenshots: the horizontal Live Wins rail shown
// directly under the top bar on game-lobby surfaces.
//
// Layout mirrors the legacy embla rail:
//   [ • Live Wins ]   <- small green-dot pill, top-left over the row
//   ┌──┬──┬──┬──┬──┬──┐
//   │  │  │  │  │  │  │   <- portrait tiles, aspect 3/4, responsive count
//   ├──┴──┴──┴──┴──┴──┤        thumbnail with masked handle + SC win
//   │ @Bra**** 0.09 SC│        below the art.
//   └─────────────────┘
//
// The ticker glides right at a variable cadence: each tick translates
// the strip by exactly one tile width with a `transition` duration
// drawn from a weighted-random distribution (mostly ~1.1-1.9 s, with
// occasional sub-second bursts and >2.5 s lulls). On every tick the
// component appends a fresh win to the right edge so the stream feels
// alive — never stops on hover, never pauses on click. A periodic
// snap-cleanup keeps the buffer bounded.

export interface LiveWin {
  id: string
  playerHandle: string
  gameSlug: string
  gameName: string
  thumbnailUrl: string | null
  amountSc: string
  wonAt: string
}

interface LiveWinsTickerProps {
  wins: LiveWin[]
  className?: string
}

const WINDOW_SIZE = 28
const MAX_BUFFER = 60

// Legacy embla visible-slide counts per viewport width band.
function visibleSlideCount(viewportWidth: number): number {
  if (viewportWidth <= 380) return 4
  if (viewportWidth <= 480) return 6
  if (viewportWidth <= 640) return 8
  if (viewportWidth <= 768) return 10
  if (viewportWidth <= 1024) return 12
  if (viewportWidth <= 1280) return 14
  if (viewportWidth <= 1536) return 16
  return 19
}

function pickInterval(): number {
  const r = Math.random()
  if (r < 0.15) return 420 + Math.random() * 320
  if (r < 0.85) return 1100 + Math.random() * 800
  return 2300 + Math.random() * 700
}

export function LiveWinsTicker({ wins, className }: LiveWinsTickerProps) {
  const winsRef = React.useRef(wins)
  winsRef.current = wins

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const stripRef = React.useRef<HTMLDivElement | null>(null)
  const stepRef = React.useRef(64)

  const seedWindow = React.useCallback((source: LiveWin[]): LiveWin[] => {
    if (source.length === 0) return []
    return Array.from({ length: WINDOW_SIZE }, (_, i) => {
      const base = source[i % source.length]!
      return { ...base, id: `${base.id}-seed-${i}` }
    })
  }, [])

  const [view, setView] = React.useState<LiveWin[]>(() => seedWindow(wins))
  const [slideStep, setSlideStep] = React.useState(64)
  const [animTick, setAnimTick] = React.useState(0)
  const animDurationRef = React.useRef(1500)
  const cursorRef = React.useRef(WINDOW_SIZE)
  const tickRef = React.useRef(0)

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const w = viewport.clientWidth
      const count = visibleSlideCount(w)
      const next = w / count
      stepRef.current = next
      setSlideStep(next)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [])

  // Keep the strip aligned when the responsive slide width changes.
  React.useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    strip.style.transform = 'translate3d(0px, 0px, 0px)'
  }, [slideStep])

  React.useLayoutEffect(() => {
    if (animTick === 0) return
    const strip = stripRef.current
    const step = stepRef.current
    if (!strip || step <= 0) return

    strip.style.transition = 'none'
    strip.style.transform = `translate3d(-${step}px, 0px, 0px)`
    requestAnimationFrame(() => {
      strip.style.transition = ''
      strip.style.setProperty('--cf-step-duration', `${animDurationRef.current}ms`)
      strip.style.transform = 'translate3d(0px, 0px, 0px)'
    })
  }, [animTick])

  React.useEffect(() => {
    if (view.length === 0 && wins.length > 0) {
      setView(seedWindow(wins))
      cursorRef.current = WINDOW_SIZE
      const strip = stripRef.current
      if (strip) strip.style.transform = 'translate3d(0px, 0px, 0px)'
    }
  }, [wins, view.length, seedWindow])

  React.useEffect(() => {
    let cancelled = false
    let timeoutId: number | undefined

    function scheduleTick(delay: number) {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return
        const pool = winsRef.current
        if (pool.length === 0) {
          scheduleTick(500)
          return
        }
        const nextDelay = pickInterval()
        const next = pool[cursorRef.current % pool.length]!
        cursorRef.current += 1
        tickRef.current += 1
        animDurationRef.current = nextDelay

        setView((prev) => {
          const fresh = { ...next, id: `${next.id}-tick-${tickRef.current}` }

          if (prev.length >= MAX_BUFFER) {
            return [fresh, ...prev.slice(0, MAX_BUFFER - 1)]
          }
          return [fresh, ...prev]
        })
        setAnimTick((t) => t + 1)

        scheduleTick(nextDelay)
      }, delay)
    }

    scheduleTick(pickInterval())
    return () => {
      cancelled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [])

  if (view.length === 0) return null

  return (
    <section
      aria-label="Live Wins"
      className={cn('relative w-full rounded-lg bg-[#222222] px-2.5 pb-1 pt-3', className)}
    >
      <span
        className={cn(
          'absolute left-2.5 top-1.5 z-[1] inline-flex w-fit items-center gap-1.5 rounded',
          'bg-[#0F0F0F] px-1.5 py-0.5 text-[.625rem] font-bold leading-none text-white',
        )}
      >
        <span className="inline-block size-1 animate-pulse rounded-full bg-[#25F54B]" />
        Live Wins
      </span>

      <div ref={viewportRef} className="overflow-hidden">
        <div ref={stripRef} className="cf-step-ticker">
          {view.map((w, index) => (
            <WinPill key={w.id} win={w} slideStep={slideStep} eager={index < 8} />
          ))}
        </div>
      </div>
    </section>
  )
}

function WinPill({ win, slideStep, eager }: { win: LiveWin; slideStep: number; eager?: boolean }) {
  return (
    <div
      className="min-w-0 shrink-0 pl-2 sm:pl-3"
      style={{ flex: `0 0 ${slideStep}px`, width: slideStep }}
    >
      <Link
        href={`/casino-games/${win.gameSlug}`}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-start',
          'transition-transform duration-200 active:scale-95',
        )}
        aria-label={`${win.gameName}: ${win.playerHandle} won ${win.amountSc} SC`}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-[#151515]">
          {win.thumbnailUrl ? (
            <Image
              src={win.thumbnailUrl}
              alt="game img"
              fill
              sizes={`${Math.round(slideStep)}px`}
              className="rounded-md object-cover"
              loading={eager ? 'eager' : 'lazy'}
              unoptimized
            />
          ) : (
            <div className="grid h-full place-items-center bg-gradient-to-br from-[var(--cf-red-deep)] to-black px-1 text-center text-[10px] font-bold uppercase leading-tight text-[var(--cf-gold-light)]">
              {win.gameName.slice(0, 6)}
            </div>
          )}
        </div>
        <h3 className="w-full max-w-[4.5rem] truncate pt-1 text-center text-[10px] font-medium text-white">
          @{win.playerHandle}
        </h3>
        <p className="text-center text-[10px] font-medium text-[#25F54B]" data-numeric="true">
          {win.amountSc} SC
        </p>
      </Link>
    </div>
  )
}

export function LiveWinsTickerSkeleton({ className }: { className?: string }) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const [slideStep, setSlideStep] = React.useState(64)

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const w = viewport.clientWidth
      setSlideStep(w / visibleSlideCount(w))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [])

  return (
    <section
      aria-label="Live Wins loading"
      className={cn('relative w-full rounded-lg bg-[#222222] px-2.5 pb-1 pt-3', className)}
    >
      <span
        className={cn(
          'absolute left-2.5 top-1.5 z-[1] inline-flex w-fit items-center gap-1.5 rounded',
          'bg-[#0F0F0F] px-1.5 py-0.5 text-[.625rem] font-bold leading-none text-white',
        )}
      >
        <span className="size-1 rounded-full bg-[#25F54B]" />
        Live Wins
      </span>
      <div ref={viewportRef} className="overflow-hidden">
        <div className="cf-step-ticker">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="min-w-0 shrink-0 pl-2 sm:pl-3"
              style={{ flex: `0 0 ${slideStep}px`, width: slideStep }}
            >
              <div className="aspect-[3/4] animate-pulse rounded-md bg-[#303030]" />
              <div className="mx-auto mt-1 h-2.5 w-full max-w-[4.5rem] animate-pulse rounded bg-[#303030]" />
              <div className="mx-auto mt-1 h-2.5 w-10 animate-pulse rounded bg-[#303030]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
