'use client'

import * as React from 'react'

import { cn } from '../lib/utils'

// Coin Frenzy themed loader shown while the Shop modal waits on package
// data. Two visual layers:
//   1. A rotating gold ring (radial accent) sits behind the pile so the
//      whole composition feels alive even before the user notices the
//      pile itself.
//   2. A breathing radial glow + bobbing 3D coin pile inherits the same
//      gradients used by the sidebar SHOP glyph for brand consistency.
//
// All animation lives in `globals.css` under the `cf-shop-loader-*`
// rules — zero JS at runtime, prefers-reduced-motion respected.

interface ShopLoaderProps {
  /** Optional caption shown beneath the pile. Defaults to "Loading the shop". */
  caption?: string
  /** Visual size of the pile in pixels. Defaults to 96. */
  size?: number
  className?: string
}

export function ShopLoader({
  caption = 'Loading the shop',
  size = 96,
  className,
}: ShopLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={caption}
      className={cn('flex flex-col items-center justify-center gap-4 px-6 py-8', className)}
    >
      <div className="relative" style={{ width: size * 1.6, height: size * 1.6 }}>
        {/* Rotating golden ring backdrop */}
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="cf-shop-loader-ring absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="cf-shop-loader-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff5d0" stopOpacity="0" />
              <stop offset="35%" stopColor="#fce5a8" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#e6b558" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#3a2407" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="url(#cf-shop-loader-ring-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="140 140"
          />
        </svg>

        {/* Coin pile + breathing glow — centered inside the ring */}
        <div className="absolute inset-0 flex items-center justify-center">
          <CoinPile size={size} />
        </div>
      </div>

      <p className="cf-shop-loader-caption text-xs font-bold uppercase tracking-[0.22em] text-[var(--cf-gold-light)]">
        {caption}
      </p>
    </div>
  )
}

// Standalone version of the gold coin pile — same gradients as the
// sidebar SHOP glyph (PlayerSidebar's GoldCoinsGlyph) but rendered
// bigger and with a stronger breathing glow tuned for the loader.
function CoinPile({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="cf-shop-loader-bob"
      style={{ width: size, height: size, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="cf-shop-loader-coin-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff5d0" />
          <stop offset="30%" stopColor="#fce5a8" />
          <stop offset="65%" stopColor="#f0c66a" />
          <stop offset="100%" stopColor="#c69032" />
        </linearGradient>
        <linearGradient id="cf-shop-loader-coin-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a5f17" />
          <stop offset="55%" stopColor="#5b3a0c" />
          <stop offset="100%" stopColor="#2a1a04" />
        </linearGradient>
        <radialGradient id="cf-shop-loader-glow-grad" cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor="#fce5a8" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#dfa83d" stopOpacity="0.40" />
          <stop offset="100%" stopColor="#dfa83d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Breathing halo */}
      <circle
        className="cf-shop-loader-glow"
        cx="12"
        cy="15"
        r="13"
        fill="url(#cf-shop-loader-glow-grad)"
      />

      {/* Tier 3 — apex coin */}
      <LoaderCoin cx={12} cy={11.4} rx={2.6} ry={0.95} depth={0.85} highlight={0.55} />

      {/* Tier 2 — two coins */}
      <LoaderCoin cx={8.9} cy={13.7} rx={2.75} ry={1.0} depth={0.9} highlight={0.6} />
      <LoaderCoin cx={15.1} cy={13.7} rx={2.75} ry={1.0} depth={0.9} highlight={0.6} />

      {/* Tier 1 — three base coins */}
      <LoaderCoin cx={5.3} cy={16.4} rx={3.0} ry={1.1} depth={1.0} highlight={0.72} />
      <LoaderCoin cx={12} cy={16.9} rx={3.0} ry={1.1} depth={1.0} highlight={0.82} />
      <LoaderCoin cx={18.7} cy={16.4} rx={3.0} ry={1.1} depth={1.0} highlight={0.72} />
    </svg>
  )
}

function LoaderCoin({
  cx,
  cy,
  rx,
  ry,
  depth,
  highlight,
}: {
  cx: number
  cy: number
  rx: number
  ry: number
  depth: number
  highlight: number
}) {
  const sideTop = cy
  const sideBottom = cy + depth
  return (
    <g>
      <path
        d={`M ${cx - rx},${sideTop} A ${rx},${ry} 0 0 1 ${cx + rx},${sideTop} L ${cx + rx},${sideBottom} A ${rx},${ry} 0 0 0 ${cx - rx},${sideBottom} Z`}
        fill="url(#cf-shop-loader-coin-edge)"
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="url(#cf-shop-loader-coin-top)"
        stroke="#2a1a04"
        strokeOpacity="0.45"
        strokeWidth="0.18"
      />
      <ellipse
        cx={cx - rx * 0.32}
        cy={cy - ry * 0.18}
        rx={rx * 0.55}
        ry={ry * 0.42}
        fill="#fff5d0"
        opacity={highlight}
      />
    </g>
  )
}
