import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/utils'

// Global circular loader for the Coin Frenzy platform. A single gold
// arc rotates around a faint track ring — "slightly goldenish" per the
// brand guide, reusing the same `--cf-gold-*` tokens as the shop loader
// and primary CTAs so it reads as platform chrome, not a generic spinner.
//
// Implemented as a pure-CSS conic-gradient ring (no SVG <defs> / no
// global gradient IDs) so multiple instances on the same page can never
// collide. Server Component safe — no `'use client'` needed.
//
// All motion lives in `globals.css` under the `.cf-spinner` rules;
// the component is markup-only at runtime and honours prefers-reduced-motion.
// Use `<Spinner />` inline (button busy state, inline fetch) or as the
// global `app/loading.tsx` suspense fallback.

const spinnerVariants = cva(
  'cf-spinner relative inline-flex shrink-0 items-center justify-center',
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8',
        xl: 'h-12 w-12',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

export interface SpinnerProps
  extends
    Omit<React.HTMLAttributes<HTMLSpanElement>, 'role'>,
    VariantProps<typeof spinnerVariants> {
  /** Accessible label announced to screen readers. Defaults to "Loading". */
  label?: string
}

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size, label = 'Loading', ...props }, ref) => {
    return (
      <span
        ref={ref}
        role="status"
        aria-live="polite"
        aria-label={label}
        className={cn(spinnerVariants({ size }), className)}
        {...props}
      >
        {/*
         * Pure-CSS ring: a conic-gradient covers the gold arc portion
         * (~75% of the circle); the remaining quarter is transparent.
         * A slightly smaller inner circle (the "hole") is cut out via a
         * radial-gradient mask so only the ring border remains visible.
         * This produces a fading gold arc with zero SVG defs and no
         * global ID — safe to render any number of times on one page.
         */}
        <span aria-hidden="true" className="cf-spinner-ring h-full w-full" />
        <span className="sr-only">{label}</span>
      </span>
    )
  },
)
Spinner.displayName = 'Spinner'

export { spinnerVariants }
