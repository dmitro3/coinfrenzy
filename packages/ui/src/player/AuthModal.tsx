'use client'

import * as React from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

import { cn } from '../lib/utils'

import { CoinFrenzyLogo } from './CoinFrenzyLogo'
import { FoxIllustration, type FoxVariant } from './FoxIllustration'

// The shared two-panel modal layout used on Login, Sign Up, Forgot
// Password and email verification. The left panel holds the form (passed
// in as children), the right panel shows the gold "Coin Frenzy" logo
// stacked over a hero fox illustration with the dark-red velvet
// gradient backdrop from the live site.
//
// Layout mirrors the legacy coinfrenzy.com modal exactly:
//   - flex row, max-w-[826px], bg-[#0A0A0A], border-white/10
//   - left panel:  w-[420px] fixed, px-8 py-7
//   - 1px gold gradient vertical divider
//   - right panel: flex-1, image fills full height, logo + close overlaid

// Gold gradient matching --color-active-tab-bg from the live site CSS vars
const GOLD_GRADIENT =
  'linear-gradient(90deg,#6b4f1a 0%,#e1b144 25%,#af8332 50%,#feeb95 75%,#6b4f1a 100%)'

interface AuthModalProps {
  children: React.ReactNode
  /** Optional escape behaviour — usually "go to lobby" or "/". */
  closeHref?: string
  onClose?: () => void
  foxVariant?: FoxVariant
  className?: string
}

export function AuthModal({
  children,
  closeHref = '/',
  onClose,
  foxVariant = 'coins-half',
  className,
}: AuthModalProps) {
  return (
    <div className="relative w-full max-w-[826px]">
      <div
        className={cn(
          // Legacy auth modal is a fixed-height card so the fox hero
          // panel always shows the full mascot — not just the head.
          'relative flex w-full overflow-hidden rounded-xl border border-white/10 bg-[#0A0A0A] md:min-h-[580px]',
          className,
        )}
      >
        {/* ── Left: form panel — fixed 420px on desktop ─────────── */}
        <div className="flex w-full min-w-0 flex-col overflow-visible px-8 py-7 text-white md:w-[420px]">
          {children}
        </div>

        {/* ── Vertical gold-to-transparent divider ──────────────── */}
        <div className="hidden w-px bg-gradient-to-b from-[#E1B144] to-transparent opacity-60 md:block" />

        {/* ── Right: brand / fox panel — flex-1 remainder ──────── */}
        <aside className="relative hidden min-h-[580px] flex-1 overflow-hidden md:block md:rounded-r-xl">
          {/* Fox image fills the full panel */}
          <FoxIllustration
            variant={foxVariant}
            fill
            className="object-cover object-top"
            chromaKey={foxVariant === 'auth-modal' ? false : undefined}
            priority
          />

          {/* Logo overlaid top-left */}
          <div className="absolute left-6 top-6">
            <CoinFrenzyLogo variant="wordmark" width={120} height={48} />
          </div>

          {/* Close button lives inside the image panel */}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-5 top-5 z-20 text-white transition-opacity hover:opacity-70"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <Link
              href={closeHref}
              aria-label="Close"
              className="absolute right-5 top-5 z-20 text-white transition-opacity hover:opacity-70"
            >
              <X className="h-5 w-5" />
            </Link>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── AuthTabs ─────────────────────────────────────────────────────────────────
// Gradient-border technique from the live site:
//   Active  → 1px wrapper with gold linear-gradient bg, inner button #1e1a0e
//   Inactive → 1px wrapper with white/10 bg,            inner button #22221d
// ─────────────────────────────────────────────────────────────────────────────

interface AuthTabsProps {
  active: 'login' | 'signup'
  /** When provided, renders callback-driven buttons instead of navigation Links (modal mode). */
  onLogin?: () => void
  /** When provided, renders callback-driven buttons instead of navigation Links (modal mode). */
  onSignup?: () => void
}

export function AuthTabs({ active, onLogin, onSignup }: AuthTabsProps) {
  const useCallbacks = Boolean(onLogin || onSignup)

  return (
    <div className="mb-6 mt-1 flex gap-3">
      {/* Login tab */}
      <div
        className="rounded-md p-[1px] transition-all"
        style={{ background: active === 'login' ? GOLD_GRADIENT : 'rgba(255,255,255,0.1)' }}
      >
        {useCallbacks ? (
          <button
            type="button"
            onClick={onLogin}
            className={cn(
              'flex h-[34px] items-center rounded-md px-6 text-sm font-semibold transition-colors',
              active === 'login'
                ? 'bg-[#1e1a0e] text-white'
                : 'bg-[#22221d] text-white/60 hover:text-white',
            )}
          >
            Login
          </button>
        ) : (
          <Link
            href="/login"
            className={cn(
              'flex h-[34px] items-center rounded-md px-6 text-sm font-semibold transition-colors',
              active === 'login'
                ? 'bg-[#1e1a0e] text-white'
                : 'bg-[#22221d] text-white/60 hover:text-white',
            )}
          >
            Login
          </Link>
        )}
      </div>

      {/* Create Account tab */}
      <div
        className="rounded-md p-[1px] transition-all"
        style={{ background: active === 'signup' ? GOLD_GRADIENT : 'rgba(255,255,255,0.1)' }}
      >
        {useCallbacks ? (
          <button
            type="button"
            onClick={onSignup}
            className={cn(
              'flex h-[34px] items-center whitespace-nowrap rounded-md px-6 text-sm font-semibold transition-colors',
              active === 'signup'
                ? 'bg-[#1e1a0e] text-white'
                : 'bg-[#22221d] text-white/60 hover:text-white',
            )}
          >
            Create Account
          </button>
        ) : (
          <Link
            href="/signup"
            className={cn(
              'flex h-[34px] items-center whitespace-nowrap rounded-md px-6 text-sm font-semibold transition-colors',
              active === 'signup'
                ? 'bg-[#1e1a0e] text-white'
                : 'bg-[#22221d] text-white/60 hover:text-white',
            )}
          >
            Create Account
          </Link>
        )}
      </div>
    </div>
  )
}
