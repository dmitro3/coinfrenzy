'use client'

import * as React from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { GoldButton } from '../player/GoldButton'
import { CoinFrenzyLogo } from '../player/CoinFrenzyLogo'

// Marketing-surface header. Coin Frenzy wordmark on the left, mid-nav
// links (About / FAQ / Free Entry), Login + Sign Up buttons on the
// right. Renders a hamburger menu on mobile.

interface MarketingHeaderProps {
  authed?: boolean
  className?: string
}

const NAV = [
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/amoe', label: 'Free Entry' },
  { href: '/promotions', label: 'Promotions' },
  { href: '/responsible-gaming', label: 'Responsible Gaming' },
]

export function MarketingHeader({ authed, className }: MarketingHeaderProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-[var(--cf-border-subtle)]',
        'bg-[rgba(0,0,0,0.85)] backdrop-blur',
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Coin Frenzy home">
          <CoinFrenzyLogo variant="wordmark" width={150} height={48} priority />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-white md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[var(--cf-gray-light)] hover:text-[var(--cf-gold-light)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {authed ? (
            <GoldButton href="/lobby" size="md">
              Go to Lobby
            </GoldButton>
          ) : (
            <>
              <Link
                href="/login"
                className="h-10 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--cf-bg-card-hover)]"
              >
                Login
              </Link>
              <GoldButton href="/signup" size="md">
                Create Account
              </GoldButton>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-white md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--cf-border-subtle)] bg-[var(--cf-bg-base)] md:hidden">
          <nav className="flex flex-col px-4 py-3 text-sm font-semibold">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-2 text-white hover:text-[var(--cf-gold-light)]"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-2">
              {authed ? (
                <GoldButton href="/lobby" size="md" fullWidth>
                  Go to Lobby
                </GoldButton>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 py-2 text-center text-sm font-semibold text-white"
                  >
                    Login
                  </Link>
                  <GoldButton href="/signup" size="md" fullWidth>
                    Sign Up
                  </GoldButton>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
