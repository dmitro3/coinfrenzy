'use client'

import * as React from 'react'

import {
  durations,
  easingFns,
  prefersReducedMotion,
  tweenNumber,
  usePrevious,
} from './motion-primitives'

// docs/ux-polish-audit.md — Item 1.
//
// Tweens a numeric value smoothly when its target changes. Designed
// specifically for monetary displays:
//   - tabular-nums so the digits never reflow horizontally
//   - 2-decimal precision (matches `formatCoins`)
//   - skips the very first render so we don't run a count-up on page
//     load — only AFTER mount, when the realtime layer pushes a new
//     value, do we animate
//   - increases use ease-out cubic (satisfying "filling up") and
//     decreases use ease-out quad (gentler, less celebratory)
//
// The pill in BalancePill stays in sync because the parent ALSO scales
// up via a wrapper transform (see BalancePill). The data flows the
// raw monetary value via `value` (in major-units float) and is
// rendered as a localised "x,xxx.xx" string.

interface TickerNumberProps {
  /** Target value in MAJOR units (e.g. 1234.56 for $1,234.56). */
  value: number
  /** Whether to render decimals — defaults to true. */
  decimals?: boolean
  /** Override the tween duration; defaults to a balance-feels-right 600ms. */
  durationMs?: number
  className?: string
}

export function TickerNumber({
  value,
  decimals = true,
  durationMs = durations.medium - 120,
  className,
}: TickerNumberProps) {
  const [display, setDisplay] = React.useState<number>(value)
  const mountedRef = React.useRef(false)
  const prev = usePrevious(value)

  React.useEffect(() => {
    // First mount — pin the display at the initial value, no animation.
    if (!mountedRef.current) {
      mountedRef.current = true
      setDisplay(value)
      return
    }
    // If the value didn't actually change, skip work.
    if (prev === value) return

    if (prefersReducedMotion()) {
      setDisplay(value)
      return
    }
    // Direction-aware easing: rising feels more satisfying than falling
    // — give it the slightly punchier cubic curve.
    const from = display
    const to = value
    const easing = to > from ? easingFns.outCubic : easingFns.outQuad
    return tweenNumber({
      from,
      to,
      durationMs,
      easing,
      onUpdate: setDisplay,
    })
    // `display` and `prev` intentionally omitted from deps — they're
    // read-only snapshots used to drive the tween direction, and
    // depending on `display` would create a render loop because each
    // tween frame writes to it.
  }, [value, durationMs])

  const formatted = decimals
    ? display.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Math.round(display).toLocaleString('en-US')

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }} data-numeric="true">
      {formatted}
    </span>
  )
}
