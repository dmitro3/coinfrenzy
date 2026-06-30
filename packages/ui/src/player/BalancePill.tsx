'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { cn } from '../lib/utils'
import { TickerNumber } from './TickerNumber'
import { prefersReducedMotion, usePrevious } from './motion-primitives'

// Top-bar balance pill — the "[green-$] 29,998.87 ↕" widget. The site
// flips between GC and SC display when the user clicks the chevrons or
// taps either of the two pill rows in the dropdown. The numeric value
// itself is rendered green to match the live site.

interface BalancePillProps {
  /** Pre-formatted balance string (e.g. "29,998.87"). */
  balance: string
  /** Currency currently being displayed. */
  currency: 'GC' | 'SC'
  /** Optional callback when the user picks a different currency. */
  onSelectCurrency?: (next: 'GC' | 'SC') => void
  /** Optional alternate currency balance for the dropdown row. */
  otherBalance?: string
  /** When `true` (set while the player is inside a game iframe), the
   *  numeric balance is replaced with the word "Playing" coloured for
   *  the active currency. The live coinfrenzy.com top bar does this
   *  to avoid showing a second-old balance that doesn't match what the
   *  provider iframe is reporting — the in-game UI is the source of
   *  truth for play balances, our top bar just signals "you're live".
   *  Currency swap is still permitted (so the player can flip GC↔SC
   *  before launching a new spin). */
  inGame?: boolean
  className?: string
}

// Convert the pre-formatted "x,xxx.xx" string the chrome passes in into
// a plain Number for tweening. This intentionally tolerates an empty /
// malformed value (renders as 0).
function parseBalance(value: string | undefined): number {
  if (!value) return 0
  const cleaned = value.replace(/,/g, '').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

// Threshold for the "your stack just jumped" pulse animation on the
// pill itself. Tuned against SC (cashable currency) — anything ≥ 100 SC
// is a satisfying-enough delta to warrant the visual nudge. Smaller
// movements just tick up calmly.
const PULSE_DELTA_THRESHOLD = 100

export function BalancePill({
  balance,
  currency,
  onSelectCurrency,
  otherBalance,
  inGame = false,
  className,
}: BalancePillProps) {
  const [open, setOpen] = React.useState(false)
  const [pulse, setPulse] = React.useState(false)
  const ref = React.useRef<HTMLDivElement | null>(null)

  const numericBalance = parseBalance(balance)
  const prevNumeric = usePrevious(numericBalance)

  React.useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Pulse the pill briefly when a large positive delta arrives. We
  // gate on `prevNumeric` being defined to avoid pulsing on mount.
  React.useEffect(() => {
    if (prevNumeric === undefined) return
    if (prefersReducedMotion()) return
    const delta = numericBalance - prevNumeric
    if (delta < PULSE_DELTA_THRESHOLD) return
    setPulse(true)
    const handle = window.setTimeout(() => setPulse(false), 600)
    return () => window.clearTimeout(handle)
  }, [numericBalance, prevNumeric])

  const other = currency === 'GC' ? 'SC' : 'GC'

  // Visual: GC shows a gold coin glyph; SC shows the green sweepstakes
  // coin. Both are minted-looking 3D coins, matching the live site.
  const isSc = currency === 'SC'

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'cf-widget group flex h-9 items-center gap-2 rounded-lg pl-1.5 pr-2 text-[13px] font-semibold',
          'transition-transform duration-300 ease-out will-change-transform',
          pulse && 'cf-balance-pulse',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={inGame ? `Playing ${currency} — switch currency` : 'Switch currency'}
      >
        <CoinGlyph kind={isSc ? 'sc' : 'gc'} />
        {inGame ? (
          // While in a game we show "Playing" instead of the numeric
          // balance — the provider iframe is the source of truth for
          // the live spin balance, and showing a stale top-bar number
          // alongside the in-game balance creates flicker / mismatch.
          // Tint matches the active currency so the player still gets
          // an at-a-glance "you're playing SC" or "you're playing GC".
          <span
            className={cn(
              'whitespace-nowrap font-semibold tracking-tight',
              isSc ? 'cf-sc-shine' : 'text-[var(--cf-gold-light)]',
            )}
          >
            Playing
          </span>
        ) : (
          <TickerNumber
            value={numericBalance}
            decimals
            className={cn(
              'tracking-tight [font-feature-settings:"tnum"_1,"ss01"_1]',
              // SC balance uses the gradient-clipped "cf-sc-shine" emerald
              // for the crisper, more polished read; GC stays solid amber.
              isSc ? 'cf-sc-shine' : 'text-[var(--cf-gold-light)]',
            )}
          />
        )}
        <span className="-mr-0.5 flex flex-col leading-none text-[var(--cf-gold-light)]/70">
          <ChevronUp className="h-[11px] w-[11px]" strokeWidth={2.5} />
          <ChevronDown className="-mt-px h-[11px] w-[11px]" strokeWidth={2.5} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-md',
            'border border-[var(--cf-gold-deep)]/35 bg-[var(--cf-bg-card)] p-1 shadow-2xl shadow-black/70',
          )}
        >
          <button
            type="button"
            role="option"
            aria-selected={currency === 'GC'}
            onClick={() => {
              onSelectCurrency?.('GC')
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
              'hover:bg-[var(--cf-bg-card-hover)]',
              currency === 'GC' && 'bg-[#1a1305]',
            )}
          >
            <CoinGlyph kind="gc" size="sm" />
            <span className="flex-1 font-semibold text-white">Gold Coins</span>
            <TickerNumber
              value={parseBalance(currency === 'GC' ? balance : otherBalance)}
              decimals
              className='text-xs font-semibold tracking-tight text-[var(--cf-gold-light)] [font-feature-settings:"tnum"_1]'
            />
          </button>
          <button
            type="button"
            role="option"
            aria-selected={currency === 'SC'}
            onClick={() => {
              onSelectCurrency?.('SC')
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
              'hover:bg-[var(--cf-bg-card-hover)]',
              currency === 'SC' && 'bg-[#0a1a0e]',
            )}
          >
            <CoinGlyph kind="sc" size="sm" />
            <span className="flex-1 font-semibold text-white">Sweepstakes Coins</span>
            <TickerNumber
              value={parseBalance(currency === 'SC' ? balance : otherBalance)}
              decimals
              className='cf-sc-shine text-xs font-semibold tracking-tight [font-feature-settings:"tnum"_1]'
            />
          </button>
          <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-[var(--cf-gray-light)]">
            Showing {other === 'GC' ? 'Gold Coin' : 'Sweepstakes'} balance
          </p>
        </div>
      )}
    </div>
  )
}

// Minted-looking 3D coin glyph used in the balance pill. Two variants:
// `gc` is the gold coin with a "G" face; `sc` is the green sweepstakes
// coin with a "$" face. Both have:
//   - an outer edge ring (gold/dark-green) to read as a milled coin edge
//   - the warm-amber / saturated-green face gradient sampled from the
//     Coin Frenzy Originals
//   - a peach-cream / pale-mint highlight ellipse for the "polished"
//     reflection
//   - a deeply-engraved mintmark letter (G / $) with subtle inset
function CoinGlyph({ kind, size = 'md' }: { kind: 'gc' | 'sc'; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 22 : 26
  const faceId = kind === 'gc' ? 'cf-coin-gc-face' : 'cf-coin-sc-face'
  const edgeId = kind === 'gc' ? 'cf-coin-gc-edge' : 'cf-coin-sc-edge'
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
    >
      <defs>
        {kind === 'gc' ? (
          <>
            <radialGradient id={faceId} cx="36%" cy="28%" r="78%">
              <stop offset="0%" stopColor="#fff1bf" />
              <stop offset="35%" stopColor="#e6b558" />
              <stop offset="70%" stopColor="#c69032" />
              <stop offset="100%" stopColor="#3a2407" />
            </radialGradient>
            <linearGradient id={edgeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fce5a8" />
              <stop offset="55%" stopColor="#c69032" />
              <stop offset="100%" stopColor="#5a3f0e" />
            </linearGradient>
          </>
        ) : (
          <>
            {/* Crispier polished-emerald palette: brighter mint sheen at
             * the top-left, richer jewel-green mid, deeper shadow base.
             * Mirrors the new --cf-green-* palette so the coin and the
             * pill numeral read as one material. */}
            <radialGradient id={faceId} cx="34%" cy="26%" r="82%">
              <stop offset="0%" stopColor="#dffce9" />
              <stop offset="22%" stopColor="#34e88e" />
              <stop offset="58%" stopColor="#18c171" />
              <stop offset="86%" stopColor="#086a3c" />
              <stop offset="100%" stopColor="#052918" />
            </radialGradient>
            <linearGradient id={edgeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c8fadc" />
              <stop offset="55%" stopColor="#18c171" />
              <stop offset="100%" stopColor="#086a3c" />
            </linearGradient>
          </>
        )}
      </defs>
      {/* Outer milled edge ring */}
      <circle cx="16" cy="16" r="14.5" fill={`url(#${edgeId})`} />
      {/* Face — slightly inset from the edge */}
      <circle cx="16" cy="16" r="12.5" fill={`url(#${faceId})`} />
      {/* Inner ring outline — the engraved face boundary */}
      <circle
        cx="16"
        cy="16"
        r="12.5"
        fill="none"
        stroke={kind === 'gc' ? '#2a1a04' : '#052918'}
        strokeOpacity="0.6"
        strokeWidth="0.6"
      />
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke={kind === 'gc' ? '#fce5a8' : '#c8fadc'}
        strokeOpacity="0.5"
        strokeWidth="0.45"
      />
      {/* Polished highlight reflection — tightened for a crisper sheen. */}
      <ellipse
        cx="11.5"
        cy="10.5"
        rx="4.2"
        ry="2.4"
        fill={kind === 'gc' ? '#fff5d0' : '#eafff0'}
        opacity="0.62"
      />
      {/* Pin-prick specular glint that makes the SC coin read as wet
       * mint glass rather than flat green; on GC it adds a tiny dewdrop
       * highlight too. */}
      <circle cx="10" cy="9.2" r="0.9" fill="#ffffff" opacity={kind === 'gc' ? 0.75 : 0.85} />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="13"
        fontWeight="900"
        fill={kind === 'gc' ? '#2a1a04' : '#072811'}
        style={{ paintOrder: 'stroke' }}
      >
        {kind === 'gc' ? 'G' : '$'}
      </text>
    </svg>
  )
}
