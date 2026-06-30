'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import {
  classifyWinTier,
  fireBigWinCelebration,
  formatMinorAsWhole,
  minorToNumber,
  type WinTier,
} from './celebrations'
import {
  durations,
  easings,
  easingFns,
  hapticPatterns,
  haptic,
  prefersReducedMotion,
  tweenNumber,
} from './motion-primitives'

// docs/ux-polish-audit.md — Item 2.
//
// Big Win Reveal is a queued, dismissable overlay that fires when the
// chrome observes a positive wallet delta above tier thresholds. Three
// tiers — `big`, `huge`, `mega` — each escalate particle count, screen
// dimming, and on-screen text. Critically the overlay is
// `pointer-events: none` everywhere except its dismiss layer; the
// player can keep clicking through to anything underneath.
//
// External API: pass `events` as the realtime wallet-event stream and
// `eligible` to suppress on routes where a reveal isn't appropriate
// (account, marketing). The component renders nothing when `eligible`
// is false even if events fire.

export interface BigWinRevealEvent {
  id: number
  scDelta: bigint
  gcDelta: bigint
}

interface QueuedReveal {
  id: number
  tier: WinTier
  scDelta: bigint
  gcDelta: bigint
  receivedAt: number
}

interface BigWinRevealProps {
  eligible: boolean
  // Optional injection point — when omitted we hook the player realtime
  // context directly via a wrapper. The component is also exported as a
  // controlled variant for stories / tests.
  externalEvent?: BigWinRevealEvent | null
}

// Queue lifecycle:
//   1. caller emits an event into the queue
//   2. component pops the front, plays the reveal for the tier's duration
//   3. when finished (or dismissed) it pops the next event, with a 200ms
//      gap so the screen breathes between consecutive bonus-round wins
const INTER_REVEAL_GAP_MS = 200

const TIER_DURATIONS: Record<NonNullable<WinTier>, number> = {
  big: durations.bigWin,
  huge: durations.hugeWin,
  mega: durations.megaWin,
}

const TIER_LABEL: Record<NonNullable<WinTier>, string> = {
  big: 'BIG WIN!',
  huge: 'HUGE WIN!',
  mega: 'MEGA WIN!',
}

const COUNT_DURATION: Record<NonNullable<WinTier>, number> = {
  big: 1200,
  huge: 1800,
  mega: 2400,
}

const MEGA_FREEZE_MS = 300

export function BigWinReveal({ eligible, externalEvent }: BigWinRevealProps) {
  const [queue, setQueue] = React.useState<QueuedReveal[]>([])
  const [active, setActive] = React.useState<QueuedReveal | null>(null)

  // Push externally-provided events into the queue. We dedupe by event
  // id (the realtime layer assigns monotonically increasing ids) so a
  // re-render of the parent doesn't enqueue the same event twice.
  const seenRef = React.useRef<Set<number>>(new Set())
  React.useEffect(() => {
    if (!externalEvent) return
    if (seenRef.current.has(externalEvent.id)) return
    const tier = classifyWinTier(externalEvent.scDelta, externalEvent.gcDelta)
    if (!tier) return
    if (!eligible) {
      // Player is on /account or another quiet surface — record the id
      // so we don't fire it later if they happen to navigate while the
      // same event is still memoised by React. The mute is intentional:
      // a celebration that arrives in the middle of editing settings is
      // worse than no celebration.
      seenRef.current.add(externalEvent.id)
      return
    }
    seenRef.current.add(externalEvent.id)
    setQueue((q) => [
      ...q,
      {
        id: externalEvent.id,
        tier,
        scDelta: externalEvent.scDelta,
        gcDelta: externalEvent.gcDelta,
        receivedAt: Date.now(),
      },
    ])
  }, [externalEvent, eligible])

  // Pop the next reveal whenever we're idle and the queue is non-empty.
  React.useEffect(() => {
    if (active || queue.length === 0) return
    const next = queue[0]!
    const rest = queue.slice(1)
    setQueue(rest)
    setActive(next)
  }, [active, queue])

  // When a reveal finishes, kick off a short gap before the next one.
  const onFinished = React.useCallback(() => {
    setActive(null)
  }, [])

  const dismissAll = React.useCallback(() => {
    setQueue([])
    setActive(null)
  }, [])

  if (!eligible) return null

  return (
    <AnimatePresence>
      {active ? (
        <RevealOverlay
          key={active.id}
          reveal={active}
          onComplete={() => {
            // Tiny gap so two reveals don't fuse visually.
            setTimeout(onFinished, INTER_REVEAL_GAP_MS)
          }}
          onDismiss={dismissAll}
        />
      ) : null}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────

interface RevealOverlayProps {
  reveal: QueuedReveal
  onComplete: () => void
  onDismiss: () => void
}

function RevealOverlay({ reveal, onComplete, onDismiss }: RevealOverlayProps) {
  const tier = reveal.tier!
  const totalMs = TIER_DURATIONS[tier]
  const countMs = COUNT_DURATION[tier]
  const reduced = prefersReducedMotion()

  // Decide which currency to feature. If both moved, prefer SC because
  // it's the cashable currency (the bigger psychological moment); fall
  // back to GC otherwise.
  const featureSc = reveal.scDelta > 0n
  const featureValue = featureSc ? reveal.scDelta : reveal.gcDelta
  const currencyLabel = featureSc ? 'SC' : 'GC'
  const formattedTarget = formatMinorAsWhole(featureValue)
  const targetFloat = minorToNumber(featureValue)

  // Particles + haptic when the overlay mounts. Mega tier holds a
  // 300ms freeze before the count-up starts to amplify anticipation.
  React.useEffect(() => {
    if (reduced) return
    const fireDelay = tier === 'mega' ? MEGA_FREEZE_MS : 0
    const handle = window.setTimeout(() => {
      void fireBigWinCelebration(tier)
    }, fireDelay)
    haptic(tier === 'big' ? hapticPatterns.bigWin : hapticPatterns.megaWin)
    return () => window.clearTimeout(handle)
  }, [reduced, tier])

  // Count-up tween for the displayed amount. We hold at 0 during the
  // mega freeze, then ease to the target.
  const [display, setDisplay] = React.useState(0)
  React.useEffect(() => {
    const freeze = tier === 'mega' ? MEGA_FREEZE_MS : 0
    const startTimer = window.setTimeout(() => {
      const cancel = tweenNumber({
        from: 0,
        to: targetFloat,
        durationMs: countMs,
        easing: easingFns.outQuart,
        onUpdate: setDisplay,
      })
      cleanups.push(cancel)
    }, freeze)
    const cleanups: Array<() => void> = []
    return () => {
      window.clearTimeout(startTimer)
      cleanups.forEach((fn) => fn())
    }
  }, [targetFloat, countMs, tier])

  // Auto-dismiss after the tier's total duration; manual click also
  // dismisses, clearing any queued reveals.
  React.useEffect(() => {
    const handle = window.setTimeout(onComplete, totalMs)
    return () => window.clearTimeout(handle)
  }, [onComplete, totalMs])

  if (reduced) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
        aria-live="polite"
      >
        <div className="rounded-md border border-[var(--cf-gold-deep)]/60 bg-black/85 px-6 py-4 text-center text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--cf-gold-light)]">
            {TIER_LABEL[tier]}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">
            +{formattedTarget}{' '}
            <span className="text-base font-medium text-[var(--cf-gold-light)]">
              {currencyLabel}
            </span>
          </p>
        </div>
      </motion.div>
    )
  }

  const vignetteOpacity = tier === 'big' ? 0.35 : tier === 'huge' ? 0.5 : 0.65
  const flashOpacity = tier === 'huge' ? 0.12 : tier === 'mega' ? 0.18 : 0
  const labelSize =
    tier === 'big'
      ? 'text-3xl md:text-4xl'
      : tier === 'huge'
        ? 'text-4xl md:text-5xl'
        : 'text-5xl md:text-6xl'
  const amountSize =
    tier === 'big'
      ? 'text-6xl md:text-7xl'
      : tier === 'huge'
        ? 'text-7xl md:text-8xl'
        : 'text-8xl md:text-9xl'

  // Format the live count-up with locale separators, no decimals.
  const displayText = Math.round(display).toLocaleString('en-US')

  return (
    <motion.div
      key={reveal.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, ease: easings.outCubic } }}
      transition={{ duration: 0.3, ease: easings.outCubic }}
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Click-anywhere dismiss layer. pointer-events: auto only on this
          transparent layer so the player can still see through and the
          parent overlay doesn't block downstream clicks. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss celebration"
        className="pointer-events-auto absolute inset-0 cursor-pointer bg-transparent"
        tabIndex={-1}
      />

      {/* Edge vignette (darkens lobby a touch so the bright focal point
          can dominate). Lives below the screen flash. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: vignetteOpacity }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: easings.outQuart }}
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 95%)',
        }}
      />

      {/* Optional bright flash for huge / mega — fades quickly. */}
      {flashOpacity > 0 ? (
        <motion.div
          initial={{ opacity: flashOpacity }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: easings.outCubic }}
          className="pointer-events-none absolute inset-0 bg-white mix-blend-overlay"
        />
      ) : null}

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.35, ease: easings.outCubic } }}
        transition={{ type: 'spring', stiffness: 240, damping: 22, mass: 1.05 }}
        className="relative flex flex-col items-center"
      >
        <motion.p
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.1, ease: easings.outCubic }}
          className={`cf-headline ${labelSize} text-[var(--cf-gold-light)] drop-shadow-[0_4px_18px_rgba(204,153,51,0.55)]`}
        >
          {TIER_LABEL[tier]}
        </motion.p>
        <motion.p
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.2, ease: easings.outCubic }}
          className={`mt-3 ${amountSize} font-extrabold tabular-nums tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.75)]`}
          data-numeric="true"
        >
          {displayText}{' '}
          <span className="text-2xl font-bold text-[var(--cf-gold-light)] md:text-3xl">
            {currencyLabel}
          </span>
        </motion.p>
      </motion.div>
    </motion.div>
  )
}
