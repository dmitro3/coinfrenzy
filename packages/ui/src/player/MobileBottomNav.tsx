'use client'

import * as React from 'react'
import Link from 'next/link'
import { Grid3X3, Home, HelpCircle, Search } from 'lucide-react'

import { cn } from '../lib/utils'

// The mobile app-shell bottom nav. Mirrors the live coinfrenzy.com
// mobile pattern the founder shipped: BROWSE · LOBBY · SHOP (raised
// gold center) · SEARCH · SUPPORT. Always fixed to the bottom of the
// viewport so it never moves while the page scrolls — the whole point
// of treating the player surface as an app and not a webpage.
//
// Visible only ≤lg. Desktop keeps the sidebar.
//
// Honors `env(safe-area-inset-bottom)` so iPhones with a home
// indicator don't have their tap targets crowded against the gesture
// area. The raised SHOP button sits half-above the bar so it reads
// as the primary action — same pattern Instagram, TikTok, etc. use
// for their dominant tab.

export interface MobileBottomNavProps {
  pathname: string
  /** Tap BROWSE → open the slide-in left drawer (the existing
   *  PlayerSidebar's mobile mode). */
  onBrowse: () => void
  /** Tap the raised SHOP center → open the Shop modal. */
  onShop: () => void
  /** Tap SEARCH → open the SpotlightSearch overlay. */
  onSearch: () => void
}

export function MobileBottomNav({ pathname, onBrowse, onShop, onSearch }: MobileBottomNavProps) {
  // Lobby active when the player is on the actual lobby page OR the
  // marketing home (we render the player shell on both). Support
  // active when on the live-support / faq routes.
  const lobbyActive = pathname === '/lobby' || pathname === '/'
  const supportActive =
    pathname === '/live-support' || pathname === '/faq' || pathname.startsWith('/faq/')

  return (
    <nav
      className={cn(
        'cf-mobile-nav fixed inset-x-0 bottom-0 z-40 xl:hidden',
        'border-t border-[var(--cf-border-default)]',
        'bg-[rgba(10,10,14,0.92)] backdrop-blur-md',
      )}
      style={{ height: 'var(--cf-mobile-bottom-nav-h)' }}
      aria-label="Mobile navigation"
    >
      {/* Subtle gold rule on the top edge — matches the immersive game
          footer + the modal frames so the chrome reads as one
          consistent material. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--cf-gold-medium)]/45 to-transparent"
      />

      <ul className="relative grid h-full grid-cols-5 items-end">
        <NavItem
          label="Browse"
          icon={<Grid3X3 className="h-[18px] w-[18px]" strokeWidth={2.2} />}
          onClick={onBrowse}
        />
        <NavItem
          label="Lobby"
          icon={<Home className="h-[18px] w-[18px]" strokeWidth={2.2} />}
          href="/lobby"
          active={lobbyActive}
        />
        {/* Center cell holds the raised SHOP button. The cell itself
            stays as a layout anchor so labels above the other four
            items stay column-aligned. */}
        <li className="flex h-full items-end justify-center">
          <ShopCenterButton onClick={onShop} />
        </li>
        <NavItem
          label="Search"
          icon={<Search className="h-[18px] w-[18px]" strokeWidth={2.2} />}
          onClick={onSearch}
        />
        <NavItem
          label="Support"
          icon={<HelpCircle className="h-[18px] w-[18px]" strokeWidth={2.2} />}
          href="/live-support"
          active={supportActive}
        />
      </ul>
    </nav>
  )
}

// ─── Items ────────────────────────────────────────────────────────────

interface NavItemProps {
  label: string
  icon: React.ReactNode
  href?: string
  onClick?: () => void
  active?: boolean
}

function NavItem({ label, icon, href, onClick, active }: NavItemProps) {
  const inner = (
    <span
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-0.5 pt-1',
        'transition-colors duration-150',
        active ? 'text-[var(--cf-gold-light)]' : 'text-[#a8a8a8] active:text-white',
      )}
    >
      <span className="grid h-6 w-6 place-items-center">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      {/* Gold underline pip for the active tab — matches the live
          coinfrenzy.com mobile nav treatment so the active item is
          unmistakable at a glance. */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 h-[2px] w-6 rounded-full transition-opacity',
          active
            ? 'bg-[var(--cf-gold-light)] opacity-100 shadow-[0_0_8px_rgba(245,208,102,0.55)]'
            : 'opacity-0',
        )}
      />
    </span>
  )

  if (href) {
    return (
      <li className="flex h-full">
        <Link
          href={href}
          prefetch
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className="flex h-full w-full select-none items-stretch focus-visible:outline-none"
        >
          {inner}
        </Link>
      </li>
    )
  }

  return (
    <li className="flex h-full">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex h-full w-full select-none items-stretch focus-visible:outline-none"
      >
        {inner}
      </button>
    </li>
  )
}

// ─── Raised SHOP button ───────────────────────────────────────────────

// Center action — gold coin pile on a raised gold-bordered disc that
// sits half-above the nav bar. The visual weight tells players "this
// is THE action" at a glance, mirroring how Instagram, TikTok, etc.
// pull the dominant tab forward.
function ShopCenterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Shop"
      className={cn(
        'group relative grid h-[60px] w-[60px] place-items-center rounded-full',
        '-translate-y-[22%]',
        'border border-[var(--cf-gold-medium)]/65',
        'bg-[radial-gradient(circle_at_35%_30%,#241803_0%,#0a0608_70%,#000_100%)]',
        'shadow-[0_10px_24px_-6px_rgba(0,0,0,0.85),0_0_22px_-4px_rgba(245,208,102,0.4),inset_0_1px_0_rgba(255,245,200,0.18)]',
        'transition-transform duration-150 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-gold-light)]',
      )}
    >
      {/* Breathing gold halo behind the disc — same rhythm as the
          sidebar coin-pile so the SHOP affordance feels "alive". */}
      <span
        aria-hidden="true"
        className="cf-mobile-nav-shop-ring pointer-events-none absolute inset-[-6px] rounded-full bg-[radial-gradient(circle,rgba(245,208,102,0.42)_0%,rgba(245,208,102,0)_70%)]"
      />
      <span className="relative">
        <ShopCoinPileGlyph />
      </span>
      {/* Tiny "SHOP" caption nested into the disc — anchors meaning so
          the button isn't just a mystery icon for first-time users. */}
      <span className="pointer-events-none absolute -bottom-[18px] left-1/2 -translate-x-1/2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[var(--cf-gold-light)]">
        Shop
      </span>
    </button>
  )
}

// Compact 3-tier coin pile for the bottom-nav center button. Smaller
// + less detailed than the sidebar glyph because at this size the
// extra coins read as noise — we want a clean, instantly-readable
// "treasure pile" silhouette.
function ShopCoinPileGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id="cf-mnav-coin-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff5d0" />
          <stop offset="40%" stopColor="#f3cd6e" />
          <stop offset="100%" stopColor="#b3801f" />
        </linearGradient>
        <linearGradient id="cf-mnav-coin-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a541a" />
          <stop offset="100%" stopColor="#2a1a04" />
        </linearGradient>
      </defs>
      {/* Bottom row — three coins */}
      <Coin cx={7} cy={20} rx={3.4} ry={1.3} />
      <Coin cx={14} cy={20.5} rx={3.4} ry={1.3} />
      <Coin cx={21} cy={20} rx={3.4} ry={1.3} />
      {/* Middle row — two coins */}
      <Coin cx={10.5} cy={16.3} rx={3.1} ry={1.2} />
      <Coin cx={17.5} cy={16.3} rx={3.1} ry={1.2} />
      {/* Top coin */}
      <Coin cx={14} cy={12.6} rx={2.9} ry={1.1} />
    </svg>
  )
}

function Coin({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return (
    <g>
      <path
        d={`M ${cx - rx},${cy} A ${rx},${ry} 0 0 1 ${cx + rx},${cy} L ${cx + rx},${cy + 1.05} A ${rx},${ry} 0 0 0 ${cx - rx},${cy + 1.05} Z`}
        fill="url(#cf-mnav-coin-side)"
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="url(#cf-mnav-coin-top)"
        stroke="#2a1a04"
        strokeOpacity="0.5"
        strokeWidth="0.22"
      />
      <ellipse
        cx={cx - rx * 0.3}
        cy={cy - ry * 0.18}
        rx={rx * 0.55}
        ry={ry * 0.4}
        fill="#fff5d0"
        opacity="0.7"
      />
    </g>
  )
}
