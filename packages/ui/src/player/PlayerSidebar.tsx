'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Clock,
  Home,
  Megaphone,
  MessageCircle,
  Mic2,
  Radio,
  Star,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '../lib/utils'
import { CoinFrenzyLogo } from './CoinFrenzyLogo'
import { useShopModal } from './ShopModalContext'

// docs/10 §4.3 + screenshots: vertical sidebar with the Coin Frenzy
// wordmark at the top, three nav groups separated by dividers, and the
// gold-highlighted SHOP entry mid-sidebar. Items follow the live site's
// ordering exactly. Active state is a gold tinted strip per the
// `.cf-nav-active` utility class.

interface SidebarItem {
  label: string
  href: string
  icon: LucideIcon | ((props: { className?: string }) => React.JSX.Element)
  match?: (pathname: string) => boolean
}

// Glowing pile-of-gold-coins glyph for the SHOP sidebar entry. The
// pile is six coins arranged in a 3-2-1 pyramid (perspective view, so
// each coin reads as a top ellipse + a thin dark side band suggesting
// depth). A breathing radial halo sits behind the pile and two off-
// axis sparkles twinkle around it. All animation comes from the CSS
// keyframes `cf-coin-pile-*` defined in globals.css, so the icon costs
// zero JS at runtime.
function GoldCoinsGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('cf-coin-pile overflow-visible', className)}
    >
      <defs>
        {/* Top face of each coin — bright top, warmer mid, deep edge */}
        <linearGradient id="cf-coin-pile-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff5d0" />
          <stop offset="30%" stopColor="#fce5a8" />
          <stop offset="65%" stopColor="#f0c66a" />
          <stop offset="100%" stopColor="#c69032" />
        </linearGradient>
        {/* Side band — milled edge, dark amber to deep brown */}
        <linearGradient id="cf-coin-pile-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a5f17" />
          <stop offset="55%" stopColor="#5b3a0c" />
          <stop offset="100%" stopColor="#2a1a04" />
        </linearGradient>
        {/* Breathing halo gradient */}
        <radialGradient id="cf-coin-pile-glow" cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor="#fce5a8" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#dfa83d" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#dfa83d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Breathing halo — the cf-coin-pile-halo class animates opacity */}
      <circle
        className="cf-coin-pile__halo"
        cx="12"
        cy="15"
        r="11.5"
        fill="url(#cf-coin-pile-glow)"
      />

      {/* Tier 3 — single coin at the apex (back). Rows are stacked
          tight so the pyramid reads as one packed pile rather than
          three floating layers. */}
      <Coin cx="12" cy="11.4" rx="2.6" ry="0.95" depth="0.85" highlightOpacity={0.5} />

      {/* Tier 2 — two coins, slightly larger, partly behind the front row */}
      <Coin cx="8.9" cy="13.7" rx="2.75" ry="1.0" depth="0.9" highlightOpacity={0.6} />
      <Coin cx="15.1" cy="13.7" rx="2.75" ry="1.0" depth="0.9" highlightOpacity={0.6} />

      {/* Tier 1 — three coins, base (front, biggest) */}
      <Coin cx="5.3" cy="16.4" rx="3.0" ry="1.1" depth="1.0" highlightOpacity={0.72} />
      <Coin cx="12" cy="16.9" rx="3.0" ry="1.1" depth="1.0" highlightOpacity={0.78} />
      <Coin cx="18.7" cy="16.4" rx="3.0" ry="1.1" depth="1.0" highlightOpacity={0.72} />

      {/* Twinkling sparkles around the pile (custom 4-point star paths
          so they render identically across all fonts) */}
      <Sparkle
        cx={3.4}
        cy={5.6}
        size={1.4}
        className="cf-coin-pile__sparkle cf-coin-pile__sparkle--a"
      />
      <Sparkle
        cx={20.6}
        cy={6.8}
        size={1.1}
        className="cf-coin-pile__sparkle cf-coin-pile__sparkle--b"
      />
      <Sparkle
        cx={21}
        cy={20}
        size={0.95}
        className="cf-coin-pile__sparkle cf-coin-pile__sparkle--c"
      />
    </svg>
  )
}

// Crisp 4-point star "sparkle" rendered as an SVG path so the glyph is
// font-independent. Two crossing diamonds (one full-bright, one half
// for the inner glow) make the sparkle pop without antialiasing fuzz.
function Sparkle({
  cx,
  cy,
  size,
  className,
}: {
  cx: number
  cy: number
  size: number
  className?: string
}) {
  const arm = size
  const waist = size * 0.22
  const path = [
    `M ${cx},${cy - arm}`,
    `L ${cx + waist},${cy - waist}`,
    `L ${cx + arm},${cy}`,
    `L ${cx + waist},${cy + waist}`,
    `L ${cx},${cy + arm}`,
    `L ${cx - waist},${cy + waist}`,
    `L ${cx - arm},${cy}`,
    `L ${cx - waist},${cy - waist}`,
    'Z',
  ].join(' ')
  return (
    <g className={className} aria-hidden="true">
      <path d={path} fill="#fff5d0" />
      <circle cx={cx} cy={cy} r={size * 0.35} fill="#fff" opacity="0.85" />
    </g>
  )
}

// One coin rendered in perspective view: a thin gold-edged "side"
// band under the top ellipse so the coin reads as a 3D disc seen
// from above, not a flat oval. `depth` is the height of the side
// band; `highlightOpacity` controls the polished top reflection
// (used to brighten front-row coins so the pile reads volumetrically).
function Coin({
  cx,
  cy,
  rx,
  ry,
  depth,
  highlightOpacity = 0.55,
}: {
  cx: string
  cy: string
  rx: string
  ry: string
  depth: string
  highlightOpacity?: number
}) {
  const cxNum = Number(cx)
  const cyNum = Number(cy)
  const rxNum = Number(rx)
  const ryNum = Number(ry)
  const depthNum = Number(depth)
  const sideTop = cyNum
  const sideBottom = cyNum + depthNum
  // The side-band path traces:
  //   1. Top-arc: from left edge of top ellipse, clockwise through the
  //      bottom of the top ellipse, to its right edge (sweep=1).
  //   2. Line down by `depth` to the right edge of the offset bottom
  //      ellipse.
  //   3. Bottom-arc: counter-clockwise (sweep=0) back through the
  //      bottom of the offset ellipse to its left edge.
  // The result is a thin crescent that reads as the visible rim of a
  // disc-shaped coin viewed from above with slight perspective.
  return (
    <g>
      <path
        d={`M ${cxNum - rxNum},${sideTop} A ${rxNum},${ryNum} 0 0 1 ${cxNum + rxNum},${sideTop} L ${cxNum + rxNum},${sideBottom} A ${rxNum},${ryNum} 0 0 0 ${cxNum - rxNum},${sideBottom} Z`}
        fill="url(#cf-coin-pile-edge)"
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="url(#cf-coin-pile-top)"
        stroke="#2a1a04"
        strokeOpacity="0.45"
        strokeWidth="0.18"
      />
      <ellipse
        cx={cxNum - rxNum * 0.32}
        cy={cyNum - ryNum * 0.18}
        rx={rxNum * 0.55}
        ry={ryNum * 0.42}
        fill="#fff5d0"
        opacity={highlightOpacity}
      />
    </g>
  )
}

// Custom slot machine SVG icon — lucide doesn't ship one and the live
// site uses a slot-machine glyph in the second nav group.
function SlotMachineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </svg>
  )
}

// Megaphone variant — lucide has Megaphone but Promotions on the live
// site uses a slightly different glyph. Re-using lucide is fine.

const GROUP_TOP: SidebarItem[] = [
  { label: 'Lobby', href: '/lobby', icon: Home, match: (p) => p === '/lobby' || p === '/' },
  { label: 'Favorites', href: '/favorites', icon: Star },
  { label: 'Recent Games', href: '/recent-games', icon: Clock },
]

const GROUP_CATEGORIES: SidebarItem[] = [
  { label: 'Originals', href: '/casino-games?category=originals', icon: Zap },
  { label: 'Slots', href: '/casino-games?category=slots', icon: SlotMachineIcon },
  { label: 'Live Dealers', href: '/casino-games?category=live-dealers', icon: Users },
  { label: 'Game Shows', href: '/casino-games?category=game-shows', icon: Mic2 },
  { label: 'Live Games', href: '/casino-games?category=live-games', icon: Radio },
]

const GROUP_SHOP: SidebarItem[] = [{ label: 'SHOP', href: '/shop', icon: GoldCoinsGlyph }]

const GROUP_BOTTOM: SidebarItem[] = [
  { label: 'Referrals', href: '/referrals', icon: UserPlus },
  { label: 'Promotions', href: '/promotions', icon: Megaphone },
  { label: 'Live Support', href: '/live-support', icon: MessageCircle },
]

interface PlayerSidebarProps {
  pathname: string
  /** mobile drawer open state */
  mobileOpen?: boolean
  onClose?: () => void
  /** Dock desktop sidebar under the fixed legacy offer marquee. */
  withOfferOffset?: boolean
  /** Override the default SHOP → modal behaviour (e.g. guest → login). */
  onShop?: () => void
  /** Paths that require auth — guests get `onAuthGatedClick` instead of navigation. */
  authGatedHrefs?: readonly string[]
  onAuthGatedClick?: (href: string) => void
}

export function PlayerSidebar({
  pathname,
  mobileOpen,
  onClose,
  withOfferOffset,
  onShop,
  authGatedHrefs,
  onAuthGatedClick,
}: PlayerSidebarProps) {
  return (
    <>
      {/* Mobile scrim. Bumped to z-45 (above the bottom nav at z-40
          and the topbar at z-30) so the BROWSE drawer feels like the
          whole-app overlay it is — without this you can still see
          parts of the chrome poking through which makes the drawer
          look broken. lg:hidden keeps the desktop sidebar inline. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-[45] bg-black/70 backdrop-blur-sm xl:hidden"
        />
      )}
      <aside
        className={cn(
          // On mobile the drawer sits at z-50 so it stacks above the
          // bottom nav. On desktop it docks inline at the original z-40.
          'fixed left-0 top-0 z-50 flex h-dvh w-[260px] flex-col',
          'border-r border-solid border-[#ffffff1a] bg-[#121212]',
          'transition-transform duration-300 xl:z-40 xl:w-[17rem] xl:translate-x-0',
          withOfferOffset ? 'xl:top-20 xl:h-[calc(100dvh-80px)]' : 'xl:top-0 xl:h-dvh',
          mobileOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0',
        )}
        aria-label="Primary"
      >
        <div className="flex h-full flex-col divide-y divide-[#ffffff1a] p-4">
          <div className="relative flex items-center justify-center pb-4">
            <CoinFrenzyLogo variant="wordmark" width={144} height={48} href="/lobby" priority />
            {/* Mobile-only close affordance. Matches the live mobile
              site's drawer X — the scrim tap dismisses too, but
              giving the user a visible button is the lower-friction
              path and matches the founder's reference screenshot. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-md text-[#AAB9B4] hover:bg-[#22221d] hover:text-white xl:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto pt-4 text-base [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <NavGroup
              items={GROUP_TOP}
              pathname={pathname}
              onClose={onClose}
              authGatedHrefs={authGatedHrefs}
              onAuthGatedClick={onAuthGatedClick}
            />
            <Divider />
            <NavGroup
              items={GROUP_CATEGORIES}
              pathname={pathname}
              onClose={onClose}
              authGatedHrefs={authGatedHrefs}
              onAuthGatedClick={onAuthGatedClick}
            />
            <Divider />
            <NavGroup
              items={GROUP_SHOP}
              pathname={pathname}
              onClose={onClose}
              emphasis="shop"
              onShop={onShop}
              authGatedHrefs={authGatedHrefs}
              onAuthGatedClick={onAuthGatedClick}
            />
            <Divider />
            <NavGroup
              items={GROUP_BOTTOM}
              pathname={pathname}
              onClose={onClose}
              authGatedHrefs={authGatedHrefs}
              onAuthGatedClick={onAuthGatedClick}
            />
          </nav>
        </div>
      </aside>
    </>
  )
}

function Divider() {
  return <div className="h-px bg-[#ffffff1a]" />
}

function NavGroup({
  items,
  pathname,
  onClose,
  emphasis,
  onShop,
  authGatedHrefs,
  onAuthGatedClick,
}: {
  items: SidebarItem[]
  pathname: string
  onClose?: () => void
  emphasis?: 'shop'
  onShop?: () => void
  authGatedHrefs?: readonly string[]
  onAuthGatedClick?: (href: string) => void
}) {
  const { openShop } = useShopModal()
  const searchParams = useSearchParams()
  return (
    <ul>
      {items.map((item) => {
        const Icon = item.icon
        // Active calc:
        //   - explicit `match` wins (e.g. Lobby covers `/` and `/lobby`)
        //   - links with a query (e.g. `?category=originals`) require BOTH
        //     pathname and every query param to match — otherwise all five
        //     /casino-games?category=… rows would light up at once
        //   - plain links use exact-or-prefix match
        const [itemPath, itemQuery] = item.href.split('?') as [string, string | undefined]
        const active = item.match
          ? item.match(pathname)
          : itemQuery
            ? pathname === itemPath &&
              Array.from(new URLSearchParams(itemQuery).entries()).every(
                ([k, v]) => searchParams?.get(k) === v,
              )
            : pathname === item.href || pathname.startsWith(itemPath)
        const isShop = emphasis === 'shop'
        const rowClass = cn(
          // py-3 on mobile keeps tap targets comfortable (~44px);
          // py-2 on desktop keeps the sidebar density the founder
          // shipped originally.
          'group flex h-11 w-full items-center gap-1.5 rounded-lg px-4 text-left text-base font-medium capitalize',
          'transition-all duration-150',
          active
            ? 'cf-nav-active'
            : 'text-white hover:bg-[linear-gradient(90deg,#6b4f1a_0%,#e1b144_25%,#af8332_50%,#feeb95_75%,#6b4f1a_100%)] hover:text-white',
          isShop && !active && 'group/shop-pile text-[var(--cf-gold-light)] hover:text-white',
        )
        const inner = (
          <>
            <Icon
              className={cn(
                'shrink-0',
                isShop ? 'h-10 w-10 transition-transform duration-200' : 'h-[18px] w-[18px]',
                !isShop && 'text-white',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                isShop &&
                  'bg-[linear-gradient(90deg,#EBCD7C_0%,#9D6E22_100%)] bg-clip-text text-xl font-bold uppercase text-transparent',
                !isShop && 'font-medium',
              )}
            >
              {item.label}
            </span>
          </>
        )

        // The SHOP item opens the modal instead of navigating — matching
        // the live coinfrenzy.com behaviour where SHOP is always a popup.
        if (isShop) {
          return (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => {
                  if (onShop) onShop()
                  else openShop('buy')
                  onClose?.()
                }}
                className={rowClass}
              >
                {inner}
              </button>
            </li>
          )
        }

        // Auth-gated items (e.g. Referrals) open login for guests instead
        // of navigating to a page that would redirect back.
        const isAuthGated = authGatedHrefs?.includes(itemPath) && onAuthGatedClick
        if (isAuthGated) {
          return (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => {
                  onAuthGatedClick(item.href)
                  onClose?.()
                }}
                className={rowClass}
              >
                {inner}
              </button>
            </li>
          )
        }

        return (
          <li key={item.href}>
            <Link href={item.href} onClick={onClose} prefetch className={rowClass}>
              {inner}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
