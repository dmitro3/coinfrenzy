'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

import { cn } from '../lib/utils'
import { TickerNumber } from './TickerNumber'
import { fireClaimCelebration, firePurchaseCelebration } from './celebrations'
import {
  durations,
  easings,
  haptic,
  hapticPatterns,
  prefersReducedMotion,
} from './motion-primitives'
import { FoxIllustration } from './FoxIllustration'

// docs/ux-polish-audit.md — Item 3.
//
// Drop-in celebration view used by:
//   - RewardsPopover (daily bonus claim)
//   - ShopModalRoot  (coin package purchase)
//   - /promotions   (promo code redemption)
//
// It renders:
//   - a gold check-mark medallion with a subtle breathing pulse
//   - "You got X" copy with count-up amounts (GC and/or SC)
//   - a confetti burst sized to the moment (small for daily bonus,
//     bigger for >= $50 purchases, biggest for >= $100)
//   - a fox cameo for purchases >= $100
//   - optional "Continue" button — when omitted, the host modal closes
//     itself via `onComplete` after the auto-dismiss timer fires
//
// The component fires its celebration effects once on mount and never
// retriggers them — to play a fresh celebration, unmount and remount
// the component.

export interface SuccessCelebrationProps {
  /** Headline copy displayed above the amounts. */
  headline: string
  /** Optional sub-headline beneath the headline. */
  sub?: string
  /** Amount of GC awarded, in MAJOR units (e.g. 10_000 for 10,000 GC). */
  gcAmount?: number
  /** Amount of SC awarded, in MAJOR units (e.g. 1 for 1 SC). */
  scAmount?: number
  /** USD value of the underlying purchase, if applicable. Scales confetti + cameo. */
  usdValue?: number
  /** Variant tweaks the visual treatment (does NOT affect business logic). */
  variant?: 'claim' | 'purchase' | 'promo'
  /** Callback when the auto-dismiss timer fires, or when "Continue" is pressed. */
  onComplete?: () => void
  /** Auto-dismiss duration in ms; pass 0 to require a manual Continue click. */
  autoDismissMs?: number
  /** When true, render a Continue CTA. Defaults to true; auto-dismiss still applies. */
  showContinue?: boolean
  className?: string
}

export function SuccessCelebration({
  headline,
  sub,
  gcAmount = 0,
  scAmount = 0,
  usdValue = 0,
  variant = 'claim',
  onComplete,
  autoDismissMs,
  showContinue = true,
  className,
}: SuccessCelebrationProps) {
  const isPurchase = variant === 'purchase'
  const isBigPurchase = isPurchase && usdValue >= 100
  const isMidPurchase = isPurchase && usdValue >= 50 && usdValue < 100
  // Purchase celebrations get the signature fox-throws-coins moment;
  // claim/promo keep the lighter check-medallion + amounts. We extend
  // the auto-dismiss for purchases so the fox cameo actually lands
  // before the modal closes itself.
  const dismissMs =
    autoDismissMs ??
    (isBigPurchase
      ? 5200
      : isMidPurchase
        ? 4600
        : isPurchase
          ? 4200
          : variant === 'promo'
            ? 2500
            : 2200)

  // Fire confetti + haptic exactly once on mount. We track via ref so
  // a state change from `showContinue` etc never re-triggers it.
  const playedRef = React.useRef(false)
  React.useEffect(() => {
    if (playedRef.current) return
    playedRef.current = true
    if (isPurchase) {
      void firePurchaseCelebration(usdValue)
    } else {
      void fireClaimCelebration()
    }
    haptic(hapticPatterns.claim)
  }, [isPurchase, usdValue])

  // Auto-dismiss timer. We honour `autoDismissMs = 0` as an explicit
  // opt-out (some hosts want to wait for an external action).
  React.useEffect(() => {
    if (!onComplete || dismissMs <= 0) return
    const handle = window.setTimeout(onComplete, dismissMs)
    return () => window.clearTimeout(handle)
  }, [onComplete, dismissMs])

  const reduced = prefersReducedMotion()
  const baseTransition = reduced ? { duration: 0 } : { duration: 0.45, ease: easings.outCubic }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={baseTransition}
      className={cn('relative flex flex-col items-center px-6 py-8 text-center', className)}
      role="status"
      aria-live="polite"
    >
      {/* Bigger-tier cameo: a second fox in the top-right corner for
          >= $100 purchases. Layered above the bottom-pop fox so the
          big-buy moment feels DEFINITIVELY bigger. */}
      {isBigPurchase ? (
        <motion.div
          initial={{ x: 50, opacity: 0, rotate: -8 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20, mass: 0.9, delay: 0.25 }}
          className="pointer-events-none absolute -right-3 -top-4 h-24 w-24 md:-right-6 md:-top-6 md:h-32 md:w-32"
        >
          <FoxIllustration
            variant="coins-full"
            className="h-full w-full drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]"
          />
        </motion.div>
      ) : null}

      <CheckMedallion />

      <h2 className="cf-headline mt-5 text-xl font-bold uppercase tracking-[0.18em] text-white md:text-2xl">
        {headline}
      </h2>
      {sub ? <p className="mt-1 max-w-sm text-sm text-[var(--cf-gray-light)]">{sub}</p> : null}

      <div className="mt-5 flex flex-col items-center gap-2.5">
        {gcAmount > 0 ? (
          <AmountRow
            label="Gold Coins"
            value={gcAmount}
            color="text-[var(--cf-gold-light)]"
            currency="GC"
          />
        ) : null}
        {scAmount > 0 ? (
          <AmountRow label="Sweepstakes Coins" value={scAmount} color="cf-sc-shine" currency="SC" />
        ) : null}
      </div>

      {showContinue && onComplete ? (
        <button
          type="button"
          onClick={onComplete}
          className={cn(
            'mt-7 inline-flex h-10 items-center justify-center rounded-lg px-6 text-sm font-bold uppercase tracking-[0.14em]',
            'cf-gold-gradient text-black shadow-[inset_0_1px_0_rgba(255,245,200,0.35),0_4px_12px_rgba(245,208,102,0.22)]',
            'transition-transform duration-200 ease-out hover:-translate-y-0.5',
          )}
        >
          Continue
        </button>
      ) : null}

      {/* Signature "fox pops out from behind the widget" moment.
          Every purchase gets it — the user explicitly wanted it to
          become a "thing" players wait for. Lives below the Continue
          button in a fixed-height overflow-hidden well, so the bottom
          ~25% of the mascot is clipped naturally, selling the
          peeking-out-from-behind illusion. */}
      {isPurchase ? <FoxThrowingCoins big={isBigPurchase} reduced={reduced} /> : null}
    </motion.div>
  )
}

// Bottom-anchored fox cameo: slides up from below with a spring
// overshoot, throws a handful of gold coins that arc upward, then
// settles into a continuous gentle bob so the mascot stays "alive"
// for the full celebration window. The clipping well below it does
// the rest — the bottom of the fox is hidden by the well's
// overflow:hidden, which reads as the fox peeking out from behind
// the modal edge.
function FoxThrowingCoins({ big, reduced }: { big: boolean; reduced: boolean }) {
  // Size scales up for big-tier purchases. Mobile-first numbers; the
  // sm: bump kicks in on tablets+.
  const wellHeight = big ? 'h-[200px] sm:h-[240px]' : 'h-[170px] sm:h-[210px]'
  const foxSize = big ? 'w-[340px] sm:w-[400px]' : 'w-[300px] sm:w-[360px]'

  // The fox holds the coin stack in his upper-left hand area. The
  // thrown-coin trajectories spawn from that spot and arc outward +
  // upward. Anchored to the fox container, not the well, so a fox
  // resize doesn't drift the coin origin.
  const coinCount = big ? 9 : 6

  return (
    <div
      aria-hidden="true"
      className={cn('relative mt-6 w-full overflow-hidden pointer-events-none', wellHeight)}
    >
      <motion.div
        initial={reduced ? { y: 0, opacity: 1, rotate: 0 } : { y: '100%', opacity: 0, rotate: -8 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: 'spring', stiffness: 200, damping: 14, mass: 0.95, delay: 0.45 }
        }
        className="absolute inset-x-0 top-0 flex justify-center"
      >
        <motion.div
          className="relative"
          animate={reduced ? undefined : { y: [0, -4, 0] }}
          transition={
            reduced ? undefined : { duration: 2.8, ease: 'easeInOut', repeat: Infinity, delay: 1.4 }
          }
        >
          <FoxIllustration
            variant="coins-half"
            width={400}
            height={280}
            alt=""
            className={cn('h-auto select-none drop-shadow-[0_20px_28px_rgba(0,0,0,0.55)]', foxSize)}
          />

          {/* Thrown coins — spawn from the fox's raised hand, arc up
              and outward, fade as they rise. The hand sits ~37% from
              the left and ~24% from the top of the fox image. */}
          <div className="pointer-events-none absolute left-[37%] top-[24%]">
            {Array.from({ length: coinCount }).map((_, i) => (
              <ThrownCoin key={i} index={i} total={coinCount} big={big} reduced={reduced} />
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Soft floor glow under the fox so the cameo doesn't look
          pasted onto a flat background. */}
      <div
        className="pointer-events-none absolute inset-x-1/4 bottom-0 h-6 rounded-full bg-[var(--cf-gold-light)]/25 blur-2xl"
        aria-hidden="true"
      />
    </div>
  )
}

function ThrownCoin({
  index,
  total,
  big,
  reduced,
}: {
  index: number
  total: number
  big: boolean
  reduced: boolean
}) {
  // Spread the coins in a fan, with the apex of each arc randomised
  // a touch so the throw doesn't look mechanical. Deterministic from
  // the index so a re-render doesn't shuffle mid-animation.
  const fraction = (index + 1) / (total + 1)
  // -1.1 (far left) → +1.1 (far right). The fox holds the coins on
  // the left of the image, so we bias the spread slightly leftward.
  const spread = (fraction - 0.5) * 2.4 - 0.15
  const driftX = spread * (big ? 130 : 100)
  // Apex height — higher = more dramatic. Big buys get a taller arc.
  const apexY = -(big ? 130 : 100) - ((index * 11) % 30)
  const rotateEnd = spread * 360 + (index % 2 === 0 ? 180 : -180)
  const delay = 0.65 + index * 0.07
  const duration = 1.25 + (index % 3) * 0.12

  if (reduced) {
    // Reduced-motion: render the coin static at its apex position so
    // the shape still reads, no transitions, no idle motion.
    return (
      <span
        className="absolute"
        style={{
          transform: `translate(${driftX * 0.6}px, ${apexY * 0.4}px)`,
        }}
      >
        <CoinGlyph size={big ? 22 : 18} />
      </span>
    )
  }

  return (
    <motion.span
      className="absolute"
      initial={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
      animate={{
        x: [0, driftX * 0.55, driftX],
        y: [0, apexY, apexY * 0.2],
        scale: [0.3, 1, 0.85],
        opacity: [0, 1, 0],
        rotate: [0, rotateEnd * 0.6, rotateEnd],
      }}
      transition={{ duration, delay, ease: 'easeOut', times: [0, 0.45, 1] }}
    >
      <CoinGlyph size={big ? 22 : 18} />
    </motion.span>
  )
}

function CoinGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.45))' }}
    >
      <defs>
        <radialGradient id="cf-celebration-coin-face" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fff5d0" />
          <stop offset="35%" stopColor="#fce5a8" />
          <stop offset="70%" stopColor="#e6b558" />
          <stop offset="100%" stopColor="#8a5f17" />
        </radialGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="url(#cf-celebration-coin-face)"
        stroke="#3a2407"
        strokeWidth="0.6"
      />
      <ellipse cx="9.5" cy="9" rx="3.6" ry="1.8" fill="#fff5d0" opacity="0.55" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="900"
        fill="#3a2407"
        fontFamily="ui-serif, Georgia, serif"
      >
        $
      </text>
    </svg>
  )
}

function CheckMedallion() {
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.95, delay: 0.05 }}
      className={cn(
        'relative grid h-20 w-20 place-items-center rounded-full',
        'bg-[radial-gradient(circle_at_30%_30%,#fff5d0_0%,#e6b558_40%,#8a5f17_85%,#3a2407_100%)]',
        'shadow-[inset_0_2px_0_rgba(255,245,200,0.45),0_8px_28px_-6px_rgba(245,208,102,0.55)]',
      )}
    >
      {/* Breathing halo behind the medallion. */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 -z-10 rounded-full bg-[var(--cf-gold-medium)]/35 blur-2xl"
        initial={{ scale: 0.9, opacity: 0.4 }}
        animate={{ scale: [0.9, 1.15, 0.95], opacity: [0.4, 0.6, 0.45] }}
        transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
      />
      <Check className="h-10 w-10 text-[#1a1305]" strokeWidth={3.5} />
    </motion.div>
  )
}

function AmountRow({
  label,
  value,
  currency,
  color,
}: {
  label: string
  value: number
  currency: 'GC' | 'SC'
  color: string
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cn('text-3xl font-extrabold tabular-nums tracking-tight md:text-4xl', color)}
      >
        +
        <TickerNumber value={value} decimals={false} durationMs={durations.medium} />
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cf-gray-light)]">
        {label} ({currency})
      </span>
    </div>
  )
}
