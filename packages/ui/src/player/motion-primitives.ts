'use client'

// Shared motion language for player surfaces. Every animation in the
// player chrome MUST source its springs / easings / durations from here
// so the whole site reads as one cohesive piece of motion.
//
// Principles (from docs/ux-polish-audit.md + Rips-by-Triumph):
//   - Spring physics by default (no linear easing — ever)
//   - One hero element per moment; everything else damped
//   - Short on the hot path, longer only when rewarding
//   - Reduced-motion users get drastically reduced or zero animation

import { useEffect, useRef, useState } from 'react'
import type { Transition } from 'framer-motion'

// ─── Spring presets ───────────────────────────────────────────────────────

export const springs = {
  gentle: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } as const,
  snappy: { type: 'spring', stiffness: 320, damping: 26, mass: 0.9 } as const,
  bouncy: { type: 'spring', stiffness: 260, damping: 18, mass: 1 } as const,
  heavy: { type: 'spring', stiffness: 180, damping: 30, mass: 1.4 } as const,
} satisfies Record<string, Transition>

// ─── Easing presets ───────────────────────────────────────────────────────
// Tuned curves used wherever framer-motion springs aren't ideal (mostly
// count-ups + opacity tweens). NEVER use linear.

export const easings = {
  outCubic: [0.22, 1, 0.36, 1] as const,
  outQuart: [0.16, 1, 0.3, 1] as const,
  outQuad: [0.25, 0.46, 0.45, 0.94] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  emphasised: [0.2, 0, 0, 1] as const,
}

// ─── Duration buckets (ms) ────────────────────────────────────────────────

export const durations = {
  micro: 160,
  small: 360,
  medium: 720,
  large: 1500,
  bigWin: 2000,
  hugeWin: 3000,
  megaWin: 4000,
} as const

// ─── prefers-reduced-motion ───────────────────────────────────────────────

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// ─── Viewport breakpoint hook ─────────────────────────────────────────────
// Reactive helper used by the bottom-sheet variants of the Shop modal,
// Rewards popover, and Spotlight search so they switch between
// centered card (≥sm) and bottom-sheet (<sm) when the player rotates
// or resizes their browser. Default `sm` breakpoint matches Tailwind.
// SSR-safe: returns `false` on the server and on first render so we
// never mismatch the server-rendered HTML; the hook re-evaluates on
// mount once `window` is available.

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** True when the viewport is below Tailwind's `sm` breakpoint (640px),
 *  i.e. phone-sized. Use this to flip "centered modal" → "bottom sheet"
 *  in popovers that need to know the breakpoint at the React layer
 *  (because their positioning is computed in JS, not CSS). */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 640px)')
}

// ─── Haptics (vibration API) ──────────────────────────────────────────────
// Mobile-only. All calls are guarded — desktop browsers + reduced-motion
// users see / feel nothing.

type VibratePattern = number | readonly number[]

export function haptic(pattern: VibratePattern): void {
  if (typeof navigator === 'undefined') return
  if (!('vibrate' in navigator)) return
  if (prefersReducedMotion()) return
  try {
    // navigator.vibrate accepts mutable number[]; the readonly array
    // we surface to callers must be copied at the boundary.
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern])
  } catch {
    // Some browsers throw on excessive vibration — silently ignore.
  }
}

export const hapticPatterns = {
  // Subtle tap for tile presses / button confirmations.
  tap: 10,
  // Triple-pulse for bonus claims + promo redemptions.
  claim: [0, 30, 30, 30],
  // Celebration pulse for Big Win.
  bigWin: [0, 100, 50, 100],
  // Extended celebration for Huge / Mega.
  megaWin: [0, 150, 50, 150, 50, 150],
} as const

// ─── Number tweening helper (rAF-based, no deps) ──────────────────────────
// Tweens a numeric value from `from` -> `to` over `durationMs` using an
// easing function. Returns a cleanup. Caller is responsible for state.

type EasingFn = (t: number) => number

export const easingFns: Record<keyof typeof easings, EasingFn> = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuad: (t) => 1 - Math.pow(1 - t, 2),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  emphasised: (t) => 1 - Math.pow(1 - t, 3),
}

export interface TweenOptions {
  from: number
  to: number
  durationMs?: number
  easing?: EasingFn
  onUpdate: (value: number) => void
  onComplete?: () => void
}

export function tweenNumber({
  from,
  to,
  durationMs = durations.small,
  easing = easingFns.outCubic,
  onUpdate,
  onComplete,
}: TweenOptions): () => void {
  if (typeof window === 'undefined' || prefersReducedMotion() || durationMs <= 0) {
    onUpdate(to)
    onComplete?.()
    return () => {}
  }

  let rafId = 0
  const start = performance.now()

  const tick = (now: number) => {
    const elapsed = now - start
    const t = Math.min(1, elapsed / durationMs)
    const eased = easing(t)
    onUpdate(from + (to - from) * eased)
    if (t < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      onComplete?.()
    }
  }

  rafId = requestAnimationFrame(tick)
  return () => {
    if (rafId) cancelAnimationFrame(rafId)
  }
}

// ─── Tracking previous value (useful for delta-based effects) ─────────────

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref.current
}
