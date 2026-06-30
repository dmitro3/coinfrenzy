'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, LogOut, Search, Settings, Wallet } from 'lucide-react'

import { cn } from '../lib/utils'
import { BalancePill } from './BalancePill'
import { CoinFrenzyLogo } from './CoinFrenzyLogo'
import { RewardsPopover } from './RewardsPopover'
import { useRewardsModal } from './RewardsContext'
import { ShopButton } from './ShopButton'
import { useShopModal } from './ShopModalContext'

// Top bar shown on every page inside the player shell. Sticky at the
// top of the viewport, NEVER moves on scroll — the founder's signature
// requirement for the mobile design treats this surface as an app
// shell, not a webpage.
//
// Desktop (≥lg) layout left-to-right:
//   [Search] ............... [⚡] [BalancePill] [SHOP] [Avatar]
//   (the Coin Frenzy wordmark lives in the sidebar on desktop)
//
// Mobile (<lg) layout left-to-right:
//   [Coin Frenzy wordmark] ... [⚡] [BalancePill] [Avatar]
//   - hamburger is gone — BROWSE lives in the bottom nav now
//   - search icon is gone — SEARCH lives in the bottom nav now
//   - SHOP is gone — the raised gold SHOP coin-pile is in the bottom nav,
//     so duplicating it here would just clutter the chrome
//   - the balance pill is visible (it was hidden at <sm before, which
//     left mobile players unable to see their wallet without opening
//     the shop)

interface PlayerTopBarProps {
  balance: string
  currency: 'GC' | 'SC'
  otherBalance?: string
  onSelectCurrency?: (next: 'GC' | 'SC') => void
  displayName: string
  avatarSrc?: string
  onOpenSearch?: () => void
  onOpenBonus?: () => void
  onSignOut?: () => void
  /** Forwarded to BalancePill. Set true while the player is inside a
   *  game iframe (immersive route) so the balance pill shows "Playing"
   *  instead of a numeric value the in-game UI is already tracking. */
  inGame?: boolean
  /** Keeps the sticky header below the fixed legacy offer marquee. */
  withOfferOffset?: boolean
}

export function PlayerTopBar({
  balance,
  currency,
  otherBalance,
  onSelectCurrency,
  displayName,
  avatarSrc,
  onOpenSearch,
  onOpenBonus,
  onSignOut,
  inGame,
  withOfferOffset,
}: PlayerTopBarProps) {
  const { openShop } = useShopModal()
  const rewardsModal = useRewardsModal()
  const [rewardsAnchor, setRewardsAnchor] = React.useState<DOMRect | null>(null)
  const rewardsBtnRef = React.useRef<HTMLButtonElement | null>(null)
  const rewardsOpen = rewardsModal.open

  const captureAnchor = React.useCallback(() => {
    if (rewardsBtnRef.current) {
      setRewardsAnchor(rewardsBtnRef.current.getBoundingClientRect())
    }
  }, [])

  // External opens (e.g. /promotions?openRewards=1) still need a valid
  // anchor rect — when the context flips to open without us toggling
  // it, grab the rect on the next frame so positioning is correct.
  React.useEffect(() => {
    if (rewardsOpen) captureAnchor()
  }, [rewardsOpen, captureAnchor])

  const toggleRewards = React.useCallback(() => {
    const next = !rewardsOpen
    if (next) captureAnchor()
    rewardsModal.setOpenInternal(next)
    onOpenBonus?.()
  }, [rewardsOpen, captureAnchor, rewardsModal, onOpenBonus])

  return (
    <header
      className={cn(
        // Bumped horizontal padding to `px-4` on mobile so the wordmark
        // doesn't kiss the left edge. `gap-3` between the major children
        // (logo, right cluster) replaces the tighter `gap-2` so the
        // brand reads as its own thing instead of crammed against the
        // action cluster.
        'sticky z-30 flex h-[90px] items-center border-b',
        withOfferOffset ? 'top-[45px] md:top-20' : 'top-0',
        'border-[#ffffff1a] bg-[#121212]',
      )}
    >
      <div className="cf-player-content flex items-center gap-3">
        {/* Mobile-only: Coin Frenzy wordmark anchors the left edge — the
          sidebar is hidden on mobile so the wordmark has to live in
          the topbar to keep the brand visible. `pr-2` adds an extra
          breath on the right of the logo, separate from the header's
          gap, so the wordmark feels intentional and not jammed. */}
        <Link
          href="/lobby"
          aria-label="Coin Frenzy home"
          className="flex shrink-0 items-center pr-2 xl:hidden xl:pr-0"
        >
          <CoinFrenzyLogo variant="wordmark" width={108} height={36} priority />
        </Link>

        {/* Desktop-only: search lives here because BROWSE/SEARCH/SUPPORT
          aren't in a bottom-nav at this breakpoint. */}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search games"
          className={cn(
            'cf-widget hidden h-9 w-9 place-items-center rounded-lg xl:grid',
            'text-[#e8e8e8] transition-colors hover:text-white',
          )}
        >
          <Search className="h-[15px] w-[15px] stroke-[2.2]" />
        </button>

        <div className="flex flex-1 items-center justify-end gap-2.5 sm:gap-2.5">
          <button
            type="button"
            ref={rewardsBtnRef}
            onClick={toggleRewards}
            aria-label="Available rewards"
            aria-expanded={rewardsOpen}
            aria-haspopup="dialog"
            className={cn(
              'cf-widget group relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg',
              rewardsOpen && 'ring-1 ring-[var(--cf-gold-medium)]/55',
            )}
          >
            <LightningBoltGlyph />
          </button>

          <RewardsPopover
            open={rewardsOpen}
            onClose={() => rewardsModal.setOpenInternal(false)}
            anchorRect={rewardsAnchor}
          />

          {/* Balance pill is now visible on every viewport. Mobile
            players need their wallet at-a-glance just as much as
            desktop players do. Flips to "Playing" while in a game
            iframe so the top bar stays consistent with the in-game
            balance reporter. */}
          <BalancePill
            balance={balance}
            currency={currency}
            onSelectCurrency={onSelectCurrency}
            otherBalance={otherBalance}
            inGame={inGame}
          />

          {/* Desktop SHOP — mobile gets the raised SHOP coin-pile in the
            bottom nav instead, so hiding the topbar variant <lg keeps
            mobile chrome from competing with itself. */}
          <ShopButton onClick={() => openShop('buy')} className="hidden xl:inline-flex" />

          <UserMenu displayName={displayName} avatarSrc={avatarSrc} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  )
}

// Lightning bolt glyph — exact silhouette from the live coinfrenzy.com
// top bar (a chunky zig-zag, not a thin slash). Two gradient stops give
// it the polished-metal yellow→orange descent the live site uses; the
// inner highlight band is a separate path so it stays crisp at any
// scale. The Pixar-lamp-style hop animation (anticipation → launch →
// peak → landing squash → settle) lives in globals.css under
// `.cf-bolt-icon` + `@keyframes cf-bolt-hop`.
function LightningBoltGlyph() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" className="cf-bolt-icon">
      <defs>
        <linearGradient id="cf-bolt-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff5b8" />
          <stop offset="22%" stopColor="#ffd64a" />
          <stop offset="55%" stopColor="#f5a623" />
          <stop offset="88%" stopColor="#c66f0e" />
          <stop offset="100%" stopColor="#6e3a06" />
        </linearGradient>
        <linearGradient id="cf-bolt-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* Bolt body — a clean 8-point silhouette tuned to the live site. */}
      <path
        d="M10.2 0 L1.4 11.3 H6.6 L4.8 22 L16.6 9.2 H10.6 L12.4 0 Z"
        fill="url(#cf-bolt-body)"
        stroke="#3a2206"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* Inner highlight ribbon along the leading edge. */}
      <path
        d="M9.6 0.6 L2.6 10.7 H6.0 L4.6 18.4 L8.0 9.4 L7.0 9.4 Z"
        fill="url(#cf-bolt-shine)"
        opacity="0.55"
      />
    </svg>
  )
}

function UserMenu({
  displayName,
  avatarSrc,
  onSignOut,
}: {
  displayName: string
  avatarSrc?: string
  onSignOut?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'P'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'cf-widget group flex h-9 items-center gap-2 rounded-lg pl-[3px] pr-2.5',
          'text-[13px] font-medium text-white',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="relative grid h-[30px] w-[30px] place-items-center">
          {/* Gold ring with a polished inner bevel — matches the live coinfrenzy.com avatar treatment. */}
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 rounded-full',
              'bg-[linear-gradient(140deg,_var(--cf-gold-pale)_0%,_var(--cf-gold-medium)_45%,_var(--cf-gold-deep)_100%)]',
              'opacity-90 transition-opacity duration-200 group-hover:opacity-100',
            )}
          />
          <span
            className={cn(
              'relative grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-full',
              'bg-[var(--cf-red-dark)] text-[11px] font-bold text-white',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.45)]',
            )}
          >
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt=""
                width={26}
                height={26}
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </span>
        </span>
        <span className="hidden max-w-[10ch] truncate font-semibold tracking-tight text-white xl:inline">
          {displayName}
        </span>
        <ChevronDown
          className={cn(
            'h-[13px] w-[13px] text-[var(--cf-gold-light)]/80 transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-md',
            'border border-[var(--cf-gold-deep)]/35 bg-[var(--cf-bg-card)] shadow-2xl',
            'shadow-black/70',
          )}
        >
          {/* Header strip with avatar + name — premium hover surface. */}
          <div className="flex items-center gap-2.5 border-b border-[var(--cf-border-subtle)] bg-gradient-to-b from-[#1a1305] to-[var(--cf-bg-card)] px-3 py-3">
            <span
              className={cn(
                'grid h-9 w-9 place-items-center overflow-hidden rounded-full',
                'bg-[var(--cf-red-dark)] text-sm font-bold text-white',
                'ring-1 ring-[var(--cf-gold-medium)]/70 ring-offset-1 ring-offset-[#1a1305]',
              )}
            >
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              ) : (
                initial
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{displayName}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--cf-gold-light)]/80">
                Member
              </div>
            </div>
          </div>

          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-[var(--cf-bg-card-hover)]"
          >
            <Settings className="h-4 w-4 text-[var(--cf-gold-light)]" /> Settings
          </Link>
          <Link
            role="menuitem"
            href="/account/history"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-[var(--cf-bg-card-hover)]"
          >
            <Wallet className="h-4 w-4 text-[var(--cf-gold-light)]" /> Transactions
          </Link>
          <div className="h-px bg-[var(--cf-border-subtle)]" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false)
              onSignOut?.()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-white hover:bg-[var(--cf-bg-card-hover)]"
          >
            <LogOut className="h-4 w-4 text-[var(--cf-gray-light)]" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
