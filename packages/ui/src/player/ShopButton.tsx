'use client'

import * as React from 'react'

import { cn } from '../lib/utils'

// The signature gold metallic SHOP button in the top bar. Trapezoidal
// pill — wider at top, narrower at bottom — with a polished-metal gold
// gradient and an inner highlight band, matching the live coinfrenzy.com
// top bar exactly. The shape and gradient live in globals.css under
// `.cf-shop-button`; this component is the markup + interaction layer.

interface ShopButtonProps {
  onClick?: () => void
  className?: string
  label?: string
  size?: 'md' | 'lg'
}

export function ShopButton({ onClick, className, label = 'SHOP', size = 'md' }: ShopButtonProps) {
  const dims = size === 'lg' ? 'h-11 w-[124px] text-[15px]' : 'h-9 w-[112px] text-[13px]'
  // The coin pour is a SIBLING of the trapezoidal button (not a child),
  // so falling coins are no longer clipped by the polygon clip-path.
  // `.cf-shop-wrap` provides the positioning context.
  return (
    <span className={cn('cf-shop-wrap', className)}>
      <button
        type="button"
        onClick={onClick}
        aria-label="Open shop"
        className={cn(
          'cf-shop-button group inline-flex items-center justify-center',
          'font-black uppercase tracking-[0.18em]',
          'shadow-[0_6px_18px_-6px_rgba(245,208,102,0.55),0_2px_0_rgba(80,52,10,0.6)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-gold-light)]',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cf-bg-base)]',
          dims,
        )}
      >
        <span className="relative z-10 [font-feature-settings:'ss01'_1] [text-shadow:0_1px_0_rgba(255,248,220,0.55)]">
          {label}
        </span>
      </button>
      <span className="cf-shop-button__pour" aria-hidden="true">
        <span className="cf-shop-button__coin cf-shop-button__coin--1" />
        <span className="cf-shop-button__coin cf-shop-button__coin--2" />
        <span className="cf-shop-button__coin cf-shop-button__coin--3" />
        <span className="cf-shop-button__coin cf-shop-button__coin--4" />
        <span className="cf-shop-button__coin cf-shop-button__coin--5" />
        <span className="cf-shop-button__coin cf-shop-button__coin--6" />
      </span>
    </span>
  )
}
