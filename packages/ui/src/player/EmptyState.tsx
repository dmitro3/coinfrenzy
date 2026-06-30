'use client'

import * as React from 'react'

import { cn } from '../lib/utils'
import { FoxIllustration, type FoxVariant } from './FoxIllustration'

// docs/ux-polish-audit.md — Item 5.
//
// One canonical "this rail / page / list has nothing to show right now"
// component. The laying-back tuxedo fox mascot — sampled from the live
// coinfrenzy.com no-data state — anchors the moment; the headline +
// sub copy are written in the player voice, and the optional reset
// CTA gives the player a single confident next action. Designed empty
// states beat generic "No data found" plates because every empty
// state is also a chance to convert. The greyscale + soft glow
// "NO DATA FOUND" treatment is the brand pattern across player &
// marketing surfaces; per-caller headlines override the default.

interface EmptyStateProps {
  /** Top-of-card display headline. Defaults to 'No Data Found'. */
  headline?: string
  /** Sub-headline beneath the headline; one sentence is plenty. */
  sub?: string
  /** Optional reset / try-again CTA. */
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  /** Show the fox mascot. Defaults to true. */
  showFox?: boolean
  /** Which fox variant to render. Defaults to the laying tuxedo fox. */
  foxVariant?: FoxVariant
  /** Hide the card chrome (border + background panel) when the empty
   *  state already sits inside its own panel. Defaults to false. */
  bare?: boolean
  className?: string
}

export function EmptyState({
  headline = 'No Data Found',
  sub,
  action,
  showFox = true,
  foxVariant = 'laying',
  bare = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid place-items-center px-6 py-12 text-center',
        bare
          ? ''
          : 'rounded-lg border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-card)]/40',
        className,
      )}
    >
      {showFox ? (
        <FoxIllustration
          variant={foxVariant}
          width={400}
          height={300}
          // The laying PNG already has alpha; for the older green-screen
          // JPG variants the FoxIllustration's chroma-key default
          // handles the background.
          chromaKey={foxVariant !== 'laying'}
          className={cn(
            'mx-auto h-auto w-full select-none',
            foxVariant === 'laying'
              ? 'max-w-[400px] drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]'
              : 'max-w-sm grayscale',
          )}
          alt="Coin Frenzy fox mascot laying back — no data found"
        />
      ) : null}
      <p
        className={cn(
          'cf-headline mt-5 text-2xl font-extrabold uppercase tracking-[0.18em] text-white md:text-3xl',
          // Soft white glow + a tight inner shadow so the headline
          // reads off the dark page surface without competing with
          // the gold chrome — matches the live "NO DATA FOUND" treatment.
          '[text-shadow:0_0_28px_rgba(255,255,255,0.18),0_1px_0_rgba(0,0,0,0.55)]',
        )}
      >
        {headline}
      </p>
      {sub ? <p className="mt-2 max-w-md text-sm text-[var(--cf-gray-light)]">{sub}</p> : null}
      {action ? <EmptyAction {...action} /> : null}
    </div>
  )
}

function EmptyAction({
  label,
  onClick,
  href,
}: {
  label: string
  onClick?: () => void
  href?: string
}) {
  const baseClass =
    'mt-5 inline-flex h-10 items-center justify-center rounded-md px-5 text-xs font-extrabold uppercase tracking-[0.16em] cf-gold-gradient text-[#1a1300] transition-transform duration-200 ease-out hover:-translate-y-0.5'
  if (href) {
    return (
      <a className={baseClass} href={href}>
        {label}
      </a>
    )
  }
  return (
    <button type="button" className={baseClass} onClick={onClick}>
      {label}
    </button>
  )
}
