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
    <div className="relative w-full max-w-3xl">
      <div
        className={cn(
          'relative grid grid-cols-1 overflow-hidden rounded-lg border',
          'border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] shadow-2xl',
          'md:grid-cols-[1fr_320px]',
          className,
        )}
      >
        {/* Close button */}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-md text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href={closeHref}
            aria-label="Close"
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-md text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
          >
            <X className="h-4 w-4" />
          </Link>
        )}

        {/* Form panel */}
        <div className="px-6 py-8 sm:px-8 sm:py-10">{children}</div>

        {/* Brand / fox panel */}
        <aside
          aria-hidden="true"
          className={cn(
            'relative hidden overflow-hidden md:block',
            'bg-[radial-gradient(ellipse_at_top,#2a0508_0%,#0a0204_60%,#000_100%)]',
          )}
        >
          <div className="absolute inset-0 flex flex-col items-center pt-6">
            <CoinFrenzyLogo variant="wordmark" width={140} height={56} />
          </div>
          <div className="absolute inset-0 flex items-end justify-center">
            <FoxIllustration
              variant={foxVariant}
              width={360}
              height={420}
              className="h-[420px] w-auto max-w-none"
              priority
            />
          </div>
          {/* Bottom red velvet glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--cf-red-deep)]/40 to-transparent"
          />
        </aside>
      </div>
    </div>
  )
}

// Convenience header used inside the form panel to render the
// Login / Create Account tab toggle.
interface AuthTabsProps {
  active: 'login' | 'signup'
}

export function AuthTabs({ active }: AuthTabsProps) {
  return (
    <div className="mb-6 inline-flex rounded-md bg-[var(--cf-bg-elevated)] p-1 text-sm font-semibold">
      <Link
        href="/login"
        className={cn(
          'rounded-sm px-4 py-1.5 transition-colors',
          active === 'login' ? 'cf-gold-gradient text-[#1a1a1a]' : 'text-white/80 hover:text-white',
        )}
      >
        Login
      </Link>
      <Link
        href="/signup"
        className={cn(
          'rounded-sm px-4 py-1.5 transition-colors',
          active === 'signup'
            ? 'cf-gold-gradient text-[#1a1a1a]'
            : 'text-white/80 hover:text-white',
        )}
      >
        Create Account
      </Link>
    </div>
  )
}
