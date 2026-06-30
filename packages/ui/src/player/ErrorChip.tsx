'use client'

import * as React from 'react'
import { RotateCcw } from 'lucide-react'

import { cn } from '../lib/utils'

// docs/ux-polish-audit.md — Item 5.
//
// Inline retry pill. Used wherever a player-facing fetch fails but the
// surrounding page is still usable — e.g. "Couldn't load packages.
// Retry." in the Shop modal. NOT a full-page error: that's what
// app/(player)/error.tsx is for.
//
// Visually quiet (border + gold link styling, no red background) so a
// transient network blip doesn't read as a major fault.

interface ErrorChipProps {
  message?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorChip({
  message = "Couldn't load that.",
  onRetry,
  retryLabel = 'Retry',
  className,
}: ErrorChipProps) {
  return (
    <div
      role="alert"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--cf-gold-deep)]/55 bg-[#1a1305] px-3 py-1.5 text-xs',
        className,
      )}
    >
      <span className="text-[var(--cf-gray-light)]">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 text-[var(--cf-gold-light)] underline-offset-2 hover:underline"
        >
          <RotateCcw className="h-3 w-3" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}
