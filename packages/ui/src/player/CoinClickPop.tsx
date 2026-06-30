'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

// Click easter egg — ported VERBATIM from CoinFrenzy Welcome / Dalt
// funnel `spawnCoinBurst` (see CoinFrenzy Welcome/script.js §5c "Coin
// burst"). Each click anywhere on the page spawns a half-fan of 6–10
// small gold coins that arc outward and upward from the click point,
// rotating 360° as they fly, then fade out at ~85% of their lifetime.
//
// Two coin variants ("CF" face and "star" face) are picked at random,
// matching `#coin-1` / `#coin-2` in the funnel's `<symbol>` defs.
// Render is via a single portal so the coins paint over modals, the
// sidebar, the topbar, etc. without ever intercepting pointer events.
//
// Cooldown: 90ms between bursts (~11 bursts/sec max) to keep the DOM
// sane on click-spam. Reduced-motion users see nothing.

interface Coin {
  id: number
  /** Page x (clientX), the burst origin. */
  x: number
  /** Page y (clientY). */
  y: number
  /** Final translate-x in pixels at end of animation. */
  bx: number
  /** Final translate-y in pixels (negative = upward bias). */
  by: number
  /** Sprite px size (~20–30). */
  size: number
  /** Coin variant — 'cf' renders the CF face, 'star' the 5-point star. */
  variant: 'cf' | 'star'
}

const COOLDOWN_MS = 90
const LIFETIME_MS = 950
const IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function CoinClickPop() {
  const [coins, setCoins] = React.useState<Coin[]>([])
  const lastBurstRef = React.useRef(0)
  const idRef = React.useRef(0)
  const mountedRef = React.useRef(false)
  const reducedMotionRef = React.useRef(false)

  React.useEffect(() => {
    mountedRef.current = true
    if (typeof window !== 'undefined' && window.matchMedia) {
      reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return () => {
      mountedRef.current = false
    }
  }, [])

  React.useEffect(() => {
    if (reducedMotionRef.current) return

    function shouldSkip(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      if (IGNORED_TAGS.has(target.tagName)) return true
      if (target.isContentEditable) return true
      if (target.closest('[data-no-coin-pop="true"]')) return true
      return false
    }

    function handle(event: PointerEvent) {
      if (event.button !== 0) return
      if (shouldSkip(event.target)) return
      const now = performance.now()
      if (now - lastBurstRef.current < COOLDOWN_MS) return
      lastBurstRef.current = now

      // Burst size by click target: gold CTAs / shop buttons / game
      // tiles get a bigger pop than a random page click.
      let count = 6
      if (event.target instanceof HTMLElement) {
        const t = event.target.closest('.cf-shop-button, .cf-gold-gradient, [data-coin-pop="big"]')
        if (t) count = 10
      }

      const x = event.clientX
      const y = event.clientY
      const batch: Coin[] = []
      for (let i = 0; i < count; i++) {
        // Half-fan above origin, theta ranges roughly -160° to -20°.
        // Each coin gets a randomised radius (70–130px) and size (20–30px).
        const theta = ((-160 + (140 * (i + Math.random() * 0.6)) / count) * Math.PI) / 180
        const radius = 70 + Math.random() * 60
        const bx = Math.cos(theta) * radius
        const by = Math.sin(theta) * radius - 30
        const size = 20 + Math.random() * 10
        batch.push({
          id: ++idRef.current,
          x,
          y,
          bx,
          by,
          size,
          variant: Math.random() < 0.5 ? 'cf' : 'star',
        })
      }
      setCoins((prev) => [...prev, ...batch])
      window.setTimeout(() => {
        if (!mountedRef.current) return
        const ids = new Set(batch.map((c) => c.id))
        setCoins((prev) => prev.filter((c) => !ids.has(c.id)))
      }, LIFETIME_MS)
    }

    document.addEventListener('pointerdown', handle, { passive: true })
    return () => document.removeEventListener('pointerdown', handle)
  }, [])

  if (typeof document === 'undefined' || coins.length === 0) return null
  return createPortal(
    <>
      <CoinDefs />
      {coins.map((coin) => (
        <CoinSprite key={coin.id} coin={coin} />
      ))}
    </>,
    document.body,
  )
}

// Single hidden <svg> that defines the two coin sprites. Rendered once
// per active burst inside the portal so the <use href="#cf-burst-…"/>
// references resolve correctly. Matches the funnel's `<symbol>` defs.
function CoinDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <radialGradient id="cf-burst-face-gold" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#FFF1B5" />
          <stop offset="55%" stopColor="#EBCD7C" />
          <stop offset="100%" stopColor="#9D6E22" />
        </radialGradient>
        <radialGradient id="cf-burst-face-gold-light" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#FFF8D8" />
          <stop offset="55%" stopColor="#F2D88A" />
          <stop offset="100%" stopColor="#B58A2E" />
        </radialGradient>
        <linearGradient id="cf-burst-edge-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B98E2E" />
          <stop offset="100%" stopColor="#5F4111" />
        </linearGradient>
        <symbol id="cf-burst-coin-cf" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="30" fill="url(#cf-burst-edge-gold)" />
          <circle cx="32" cy="32" r="26" fill="url(#cf-burst-face-gold)" />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="#7B5418"
            strokeWidth="0.6"
            opacity="0.55"
          />
          <text
            x="32"
            y="40"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="900"
            fontSize="20"
            fill="#5F1E1F"
            letterSpacing="-1"
          >
            CF
          </text>
          <ellipse cx="25" cy="20" rx="9" ry="3.2" fill="#FFF6D9" opacity="0.55" />
        </symbol>
        <symbol id="cf-burst-coin-star" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="30" fill="url(#cf-burst-edge-gold)" />
          <circle cx="32" cy="32" r="26" fill="url(#cf-burst-face-gold-light)" />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="#7B5418"
            strokeWidth="0.6"
            opacity="0.55"
          />
          <path
            d="M32 16 l3.4 9.6 10.6.6 -8.4 6.4 3.0 9.8 -8.6-6 -8.6 6 3.0-9.8 -8.4-6.4 10.6-.6Z"
            fill="#7A4A12"
            opacity="0.85"
          />
          <ellipse cx="25" cy="20" rx="9" ry="3.2" fill="#FFF8E0" opacity="0.55" />
        </symbol>
      </defs>
    </svg>
  )
}

function CoinSprite({ coin }: { coin: Coin }) {
  const href = coin.variant === 'cf' ? '#cf-burst-coin-cf' : '#cf-burst-coin-star'
  return (
    <span
      className="cf-coin-burst"
      style={
        {
          left: `${coin.x}px`,
          top: `${coin.y}px`,
          width: `${coin.size}px`,
          height: `${coin.size}px`,
          ['--cf-burst-bx' as string]: `${coin.bx.toFixed(1)}px`,
          ['--cf-burst-by' as string]: `${coin.by.toFixed(1)}px`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width="100%" height="100%">
        <use href={href} />
      </svg>
    </span>
  )
}
