'use client'

import type { Options as ConfettiOptions } from 'canvas-confetti'

import { prefersReducedMotion } from './motion-primitives'

// Shared confetti recipe. Each Big Win tier escalates particle count +
// origin spread; claim / purchase celebrations re-use the same color
// palette but with smaller scattershots.
//
// The library is loaded dynamically so the bundle penalty only lands
// once a celebration actually fires.

export type ConfettiBurstSize = 'small' | 'medium' | 'large' | 'mega'

const CF_GOLD_COLORS = ['#fff1bf', '#ebcd7c', '#cc9933', '#9d6e22', '#5a3f0e']

const COMMON_OPTIONS: ConfettiOptions = {
  colors: CF_GOLD_COLORS,
  ticks: 220,
  gravity: 1.15,
  scalar: 1.05,
  shapes: ['circle', 'square'],
  disableForReducedMotion: true,
}

const SIZE_MAP: Record<
  ConfettiBurstSize,
  { particleCount: number; spread: number; startVelocity: number }
> = {
  small: { particleCount: 60, spread: 60, startVelocity: 32 },
  medium: { particleCount: 120, spread: 90, startVelocity: 42 },
  large: { particleCount: 200, spread: 110, startVelocity: 50 },
  mega: { particleCount: 280, spread: 130, startVelocity: 58 },
}

interface Origin {
  x: number
  y: number
}

const CENTER: Origin = { x: 0.5, y: 0.5 }
const TOP_LEFT: Origin = { x: 0.15, y: 0.3 }
const TOP_RIGHT: Origin = { x: 0.85, y: 0.3 }
const BOTTOM_CENTER: Origin = { x: 0.5, y: 0.85 }

type ConfettiFireFn = (options: ConfettiOptions) => unknown

let confettiInstance: ConfettiFireFn | null = null

async function getConfetti(): Promise<ConfettiFireFn | null> {
  if (confettiInstance) return confettiInstance
  if (typeof window === 'undefined') return null
  const mod = await import('canvas-confetti')
  // canvas-confetti default export is the firing function; we cache it
  // because importing again creates a fresh canvas + worker. The return
  // type varies (Promise<null> | null) across versions — we only care
  // that the call fires, so we widen to `unknown`.
  confettiInstance = mod.default as ConfettiFireFn
  return confettiInstance
}

export async function fireConfetti(
  size: ConfettiBurstSize,
  options: { origins?: Origin[]; angle?: number } = {},
): Promise<void> {
  if (prefersReducedMotion()) return
  const fire = await getConfetti()
  if (!fire) return
  const cfg = SIZE_MAP[size]
  const origins = options.origins ?? [CENTER]
  // Stagger origins by a tiny phase so the screen feels alive rather
  // than a single popcorn pop.
  origins.forEach((origin, index) => {
    setTimeout(() => {
      fire({
        ...COMMON_OPTIONS,
        particleCount: Math.round(cfg.particleCount / origins.length),
        spread: cfg.spread,
        startVelocity: cfg.startVelocity,
        angle: options.angle ?? 90,
        origin,
      })
    }, index * 80)
  })
}

// Big Win tier helper: blasts particles from 1, 2, or 3 origins
// depending on the win size. The visual rule: more particles + wider
// origin spread = bigger feel without raising duration.
export async function fireBigWinCelebration(tier: 'big' | 'huge' | 'mega'): Promise<void> {
  if (prefersReducedMotion()) return
  if (tier === 'big') {
    await fireConfetti('medium', { origins: [CENTER] })
    return
  }
  if (tier === 'huge') {
    await fireConfetti('large', { origins: [CENTER, BOTTOM_CENTER] })
    return
  }
  // mega — three origins, longest ticks via the library default
  await fireConfetti('mega', { origins: [CENTER, TOP_LEFT, TOP_RIGHT] })
}

export async function fireClaimCelebration(): Promise<void> {
  await fireConfetti('small', { origins: [CENTER] })
}

export async function firePurchaseCelebration(usd: number): Promise<void> {
  if (usd >= 100) {
    await fireConfetti('large', { origins: [CENTER, BOTTOM_CENTER] })
    return
  }
  if (usd >= 50) {
    await fireConfetti('medium', { origins: [CENTER] })
    return
  }
  await fireConfetti('small', { origins: [CENTER] })
}

// ─── Win thresholds (per docs/ux-polish-audit.md Item 2 spec) ──────────
//   Big Win  : delta ≥ 5 SC   OR delta ≥ 1,000 GC
//   Huge Win : delta ≥ 100 SC OR delta ≥ 50,000 GC
//   Mega Win : delta ≥ 500 SC OR delta ≥ 250,000 GC
//
// Money is stored as minor units in the ledger (4 decimal places), so
// "5 SC" becomes 5 * 10_000 = 50,000n.
export type WinTier = 'big' | 'huge' | 'mega' | null

const SC = 10_000n
const GC = 10_000n

export function classifyWinTier(scDelta: bigint, gcDelta: bigint): WinTier {
  // Only positive deltas count as wins.
  const sc = scDelta > 0n ? scDelta : 0n
  const gc = gcDelta > 0n ? gcDelta : 0n
  if (sc >= 500n * SC || gc >= 250_000n * GC) return 'mega'
  if (sc >= 100n * SC || gc >= 50_000n * GC) return 'huge'
  if (sc >= 5n * SC || gc >= 1_000n * GC) return 'big'
  return null
}

// Formats a bigint minor-unit amount into a friendly "XX,XXX" string.
// Used by the Big Win reveal count-up display.
export function formatMinorAsWhole(value: bigint): string {
  const major = value < 0n ? -value : value
  const whole = major / 10_000n
  // For the reveal we don't show cents — feels cleaner.
  return whole.toLocaleString('en-US')
}

export function minorToNumber(value: bigint): number {
  // Convert minor units to a Number for animation. For displays we go
  // back to bigint via formatMinorAsWhole so we never lose precision in
  // the final render — only the tween value is a float.
  return Number(value) / 10_000
}
