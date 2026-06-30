'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'

import {
  BigWinReveal,
  BodyCfSurface,
  CfChromaKeyDef,
  CoinFrenzyLogo,
  FavoritesProvider,
  KycModalProvider,
  KycModalRoot,
  LiveWinsTicker,
  LiveWinsTickerSkeleton,
  MobileBottomNav,
  PlayerFooter,
  PlayerSidebar,
  PlayerTopBar,
  RewardsModalProvider,
  ShopModalProvider,
  ShopModalRoot,
  SpotlightSearch,
  ToastProvider,
  TopOfferStrip,
  useShopModal,
  useToast,
  type BigWinRevealEvent,
  type FavoritesContextValue,
  type LiveWin,
  type PaymentInstrument,
} from '@coinfrenzy/ui/player'
import { cn } from '@coinfrenzy/ui'

import { formatCoins } from '@/lib/format'
import { signOut } from '@/lib/auth-client'
import type { SerializedWallet, ShopModalServerData } from '@/lib/player-data'
import { useFavorites } from '@/lib/use-favorites'
import { useShopPackages } from '@/lib/use-shop-packages'

import { PlayerRealtimeProvider, useWalletEvents, usePlayerRealtime } from './_realtime'
import { TermsBanner } from './_terms-banner'

// docs/10 §4.3 + M5 redesign — the player shell renders the Coin Frenzy
// branded layout: gold-script sidebar, search/balance/SHOP topbar, the
// scrolling top-offer strip on logged-out lobby views, and the Live
// Wins ticker on game-grid pages. All in-app routes go through this
// shell.

interface PlayerShellProps {
  playerId: string
  displayName: string
  email: string
  wallets: SerializedWallet[]
  emailVerified: boolean
  blockedStateGcOnly: boolean
  initialCurrency: 'GC' | 'SC'
  shopModalData: ShopModalServerData
  /** When true the visitor is unauthenticated — the shell renders
   *  Login/Create Account CTAs instead of wallet and avatar chrome. */
  isGuest?: boolean
  children: React.ReactNode
}

export function PlayerShell(props: PlayerShellProps) {
  return (
    <PlayerRealtimeProvider playerId={props.playerId} initialWallets={props.wallets}>
      <ToastProvider>
        <RewardsModalProvider>
          <KycModalProvider>
            <ShopModalProvider>
              <FavoritesHost>
                <Shell {...props} />
                <ShopModalHost shopModalData={props.shopModalData} />
                <KycModalRoot />
                <ShopOpenOnQueryParam />
                <PurchaseSuccessToast />
                <BigWinRevealHost />
              </FavoritesHost>
            </ShopModalProvider>
          </KycModalProvider>
        </RewardsModalProvider>
      </ToastProvider>
    </PlayerRealtimeProvider>
  )
}

// Bridge between the app-level `useFavorites` TanStack Query hook and
// the dep-free `FavoritesProvider` exposed by `packages/ui`. Keeping
// this bridge in one place means every game tile and the immersive
// footer read from the same in-memory set + share the same optimistic
// flip when the player stars a game.
function FavoritesHost({ children }: { children: React.ReactNode }) {
  const fav = useFavorites()
  const value = React.useMemo<FavoritesContextValue>(
    () => ({
      isFavorite: fav.isFavorite,
      toggle: fav.toggle,
      isLoading: fav.isLoading,
      isError: fav.isError,
    }),
    [fav.isFavorite, fav.isLoading, fav.isError, fav.toggle],
  )
  return <FavoritesProvider value={value}>{children}</FavoritesProvider>
}

// Mounts the Shop modal and *prefetches* the coin packages on shell
// mount via TanStack Query. By the time the player clicks SHOP the
// cache is hot 95%+ of the time, so the modal opens straight into the
// package grid — no grey skeleton, no "jacky load". When the network
// is cold the modal renders the Coin Frenzy themed loader (see
// ShopLoader) until the data lands, then crossfades into the full
// content.
function ShopModalHost({ shopModalData }: { shopModalData: ShopModalServerData }) {
  const packagesQuery = useShopPackages()
  return (
    <ShopModalRoot
      redeemableSc={shopModalData.redeemableSc}
      redeemableUsd={shopModalData.redeemableUsd}
      totalSc={shopModalData.totalSc}
      kycVerified={shopModalData.kycVerified}
      blockedScState={shopModalData.blockedScState}
      instruments={shopModalData.instruments as PaymentInstrument[]}
      packagesQuery={packagesQuery}
    />
  )
}

// Routes where the BigWinReveal celebration is allowed to fire. Quiet
// surfaces (account, support, marketing/legal) are intentionally
// excluded: a player adjusting their notification prefs deserves not
// to have a confetti burst land mid-form. The win event is still
// observed and forwarded but the reveal is suppressed there.
const BIG_WIN_ROUTES = [
  '/lobby',
  '/casino-games',
  '/games',
  '/favorites',
  '/recent-games',
  '/promotions',
  '/bonuses',
  '/vip',
]

function isBigWinEligible(pathname: string): boolean {
  return BIG_WIN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function BigWinRevealHost() {
  const pathname = usePathname() ?? '/'
  const [event, setEvent] = React.useState<BigWinRevealEvent | null>(null)
  useWalletEvents(
    React.useCallback((wallet) => {
      // Only win and bonus events should trigger the BigWinReveal.
      // Purchases (USD → coins) are celebrated via the Shop modal
      // success view; redemptions and `refresh` are just data syncs.
      if (wallet.reason !== 'win' && wallet.reason !== 'bonus') return
      setEvent({ id: wallet.id, scDelta: wallet.scDelta, gcDelta: wallet.gcDelta })
    }, []),
  )
  return <BigWinReveal eligible={isBigWinEligible(pathname)} externalEvent={event} />
}

// Surface the success/failure toast when the player returns from the
// purchase or redemption flow via a query-string redirect. Centralised
// here so every successful checkout, no matter the entry point, gets
// the same gold confirmation toast.
function PurchaseSuccessToast() {
  const toast = useToast()
  const router = useRouter()
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const purchase = params.get('purchase')
    if (!purchase) return
    if (purchase === 'success') {
      toast.success('Your coins are on the way.', { title: 'Purchase successful' })
    } else if (purchase === 'cancelled') {
      toast.info('No charge was made.', { title: 'Purchase cancelled' })
    } else if (purchase === 'failed') {
      toast.error('Your card was declined. Try another payment method.', {
        title: 'Purchase failed',
      })
    }
    params.delete('purchase')
    const next = params.toString()
    const clean = window.location.pathname + (next ? `?${next}` : '')
    window.history.replaceState({}, '', clean)
    // Refresh server data so the new wallet balance lands.
    router.refresh()
  }, [router, toast])
  return null
}

// Opens the shop modal automatically when navigating with `?shop=1`. Used
// by the legacy `/shop` route which now redirects to lobby with this
// query string, and by purchase-cancel redirects from the mock vendor.
function ShopOpenOnQueryParam() {
  const { openShop } = useShopModal()
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('shop') === '1') {
      openShop('buy')
      // Clean up the URL so refreshes don't keep popping the modal.
      params.delete('shop')
      const next = params.toString()
      const clean = window.location.pathname + (next ? `?${next}` : '')
      window.history.replaceState({}, '', clean)
    } else if (params.get('shop') === 'redeem') {
      openShop('redeem')
      params.delete('shop')
      const next = params.toString()
      const clean = window.location.pathname + (next ? `?${next}` : '')
      window.history.replaceState({}, '', clean)
    }
  }, [openShop])
  return null
}

// Routes where the Live Wins ticker should render — game lobby surfaces
// per the live site. We exclude the cashier, account, and support
// surfaces to keep them quieter.
const TICKER_ROUTES = ['/lobby', '/casino-games', '/favorites', '/recent-games', '/promotions']

// "Immersive" game-play surface: `/games/{gameId}`. We hide the
// sidebar, footer, ticker, and chrome banners so the provider iframe
// (Alea, sandbox, etc.) gets the full viewport between the top bar
// and the page's own GameImmersiveFooter. Mirrors the live
// coinfrenzy.com game-play structure the founder shipped.
function isImmersiveGameRoute(pathname: string): boolean {
  return /^\/games\/[^/]+/.test(pathname)
}

function Shell({
  displayName,
  blockedStateGcOnly,
  initialCurrency,
  isGuest,
  children,
}: PlayerShellProps) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const immersive = isImmersiveGameRoute(pathname)
  const showsOfferStrip = !immersive
  const { openShop } = useShopModal()

  // Close the mobile drawer whenever the route changes (otherwise the
  // drawer stays open after a player taps a sidebar link and the new
  // page mounts behind a 70% black scrim).
  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // docs/10 §7.4 — graceful degradation when Pusher isn't configured.
  // Mock vendor surfaces post a `coinfrenzy:wallet-changed` message
  // back through their parent window after firing a webhook; we
  // re-render the route server-side so the new wallets land. Same
  // pattern for `coinfrenzy:kyc-updated` so the new KYC level lands
  // immediately after the verification popup closes.
  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string } | null
      if (data?.type === 'coinfrenzy:wallet-changed') {
        router.refresh()
      } else if (data?.type === 'coinfrenzy:kyc-updated') {
        router.refresh()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [router])

  // Cmd+K / Ctrl+K opens the Spotlight overlay from anywhere on the
  // player surface. We intentionally don't depend on react-hotkeys-hook
  // here — the rule is small and the dependency-free version keeps the
  // hot path tight.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const hit =
        (event.key === 'k' || event.key === 'K') && (isMac ? event.metaKey : event.ctrlKey)
      if (!hit) return
      event.preventDefault()
      setSearchOpen((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const showsTicker =
    !immersive &&
    TICKER_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  // Immersive game routes lock the viewport to one screen — no
  // outer scroll, no sidebar — so the iframe + GameImmersiveFooter
  // can stretch flush to the bottom. Everywhere else keeps the
  // existing min-h-screen scrolling layout.
  return (
    <div
      className={cn(
        'flex bg-[var(--cf-bg-base)] text-white',
        immersive ? 'h-screen overflow-hidden' : 'min-h-screen',
      )}
    >
      <BodyCfSurface value="player" />
      <CfChromaKeyDef />
      {immersive ? null : (
        <PlayerSidebar
          pathname={pathname}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          withOfferOffset={showsOfferStrip}
        />
      )}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-all duration-300',
          // Immersive game route locks to one screen — no bottom padding
          // because the GameImmersiveFooter sits flush at the edge.
          // Every other route leaves room for the fixed mobile bottom
          // nav so neither the last row of tiles NOR the PlayerFooter
          // disappears behind it. Desktop (≥lg) zeroes the padding via
          // `.cf-mobile-nav-pad`'s own media query.
          immersive ? null : 'cf-mobile-nav-pad xl:ml-[17rem]',
        )}
      >
        {showsOfferStrip ? (
          <>
            <TopOfferStrip
              message="ALL NEW PLAYERS GET 30 COINS FOR JUST 10!"
              ctaLabel="Claim Offer"
              ctaHref="/signup"
            />
            <div aria-hidden="true" className="h-[45px] shrink-0 md:h-20" />
          </>
        ) : null}
        {isGuest ? (
          <GuestTopBar onOpenSearch={() => setSearchOpen(true)} withOfferOffset={showsOfferStrip} />
        ) : (
          <ShellTopBar
            displayName={displayName}
            initialCurrency={initialCurrency}
            inGame={immersive}
            onOpenSearch={() => setSearchOpen(true)}
            withOfferOffset={showsOfferStrip}
          />
        )}
        {/*
         * Email verification is enforced at the dedicated step in the
         * signup / first-redemption flow (see docs/07 §3), not as a
         * top-of-app banner. Keeping the shell quiet matches the live
         * coinfrenzy.com surface.
         */}
        {!immersive && blockedStateGcOnly ? <BlockedStateBanner /> : null}
        {immersive ? null : <TermsBanner />}
        <main className={cn('flex flex-1 flex-col', immersive ? 'min-h-0' : 'cf-player-content')}>
          {showsTicker ? (
            <div className="pt-3">
              <ShellWinsTicker />
            </div>
          ) : null}
          {children}
        </main>
        {immersive ? null : <PlayerFooter />}
      </div>
      <SpotlightSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(href) => router.push(href)}
      />

      {/* App-shell bottom nav. Hidden on desktop (≥lg) by the
          component itself; hidden in immersive game view so the
          GameImmersiveFooter owns the bottom edge. */}
      {immersive ? null : (
        <MobileBottomNav
          pathname={pathname}
          onBrowse={() => setMobileOpen(true)}
          onShop={() => openShop('buy')}
          onSearch={() => setSearchOpen(true)}
        />
      )}
    </div>
  )
}

function ShellTopBar({
  displayName,
  initialCurrency,
  inGame,
  onOpenSearch,
  withOfferOffset,
}: {
  displayName: string
  initialCurrency: 'GC' | 'SC'
  inGame: boolean
  onOpenSearch: () => void
  withOfferOffset?: boolean
}) {
  const { wallets } = usePlayerRealtime()
  const router = useRouter()
  const [activeCurrency, setActiveCurrency] = React.useState<'GC' | 'SC'>(initialCurrency)

  const selectCurrency = React.useCallback(
    (next: 'GC' | 'SC') => {
      if (next === activeCurrency) return
      setActiveCurrency(next)
      const oneYear = 60 * 60 * 24 * 365
      document.cookie = `active_currency=${next}; path=/; max-age=${oneYear}; samesite=lax`
      router.refresh()
    },
    [activeCurrency, router],
  )

  const gc = wallets.find((w) => w.currency === 'GC')
  const sc = wallets.find((w) => w.currency === 'SC')
  const active = activeCurrency === 'GC' ? gc : sc
  const other = activeCurrency === 'GC' ? sc : gc

  const onSignOut = React.useCallback(async () => {
    try {
      await signOut()
    } finally {
      window.location.href = '/'
    }
  }, [])

  return (
    <PlayerTopBar
      balance={formatCoins(active?.totalBalance ?? '0')}
      currency={activeCurrency}
      onSelectCurrency={selectCurrency}
      otherBalance={formatCoins(other?.totalBalance ?? '0')}
      displayName={displayName}
      onSignOut={onSignOut}
      onOpenSearch={onOpenSearch}
      inGame={inGame}
      withOfferOffset={withOfferOffset}
    />
  )
}

function ShellWinsTicker() {
  const { data, isLoading } = useQuery({
    queryKey: ['player', 'live-wins'],
    queryFn: async () => {
      const res = await fetch('/api/games/recent-wins', { cache: 'no-store' })
      if (!res.ok) return { items: [] as LiveWin[] }
      return (await res.json()) as { items: LiveWin[] }
    },
    // 25s when the tab is visible — fast enough that the ticker feels
    // live, slow enough to not compete with route compilation in dev.
    // Skipped entirely when the tab is hidden so we don't burn bandwidth
    // on a background tab.
    refetchInterval: (query) => (query.state.fetchStatus === 'paused' ? false : 25_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    staleTime: 10_000,
  })

  if (isLoading || !data) return <LiveWinsTickerSkeleton />
  if (data.items.length === 0) return null
  return <LiveWinsTicker wins={data.items} className="mb-1" />
}

function GuestTopBar({
  onOpenSearch,
  withOfferOffset,
}: {
  onOpenSearch: () => void
  withOfferOffset?: boolean
}) {
  return (
    <header
      className={cn(
        'sticky z-30 flex h-[90px] items-center border-b',
        withOfferOffset ? 'top-[45px] md:top-20' : 'top-0',
        'border-[#ffffff1a] bg-[#121212]',
      )}
    >
      <div className="cf-player-content flex items-center gap-3">
        <Link
          href="/lobby"
          aria-label="Coin Frenzy home"
          className="flex shrink-0 items-center pr-2 xl:hidden xl:pr-0"
        >
          <CoinFrenzyLogo variant="wordmark" width={108} height={36} priority />
        </Link>

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

        <div className="flex flex-1 items-center justify-end gap-3">
          <Link
            href="/login"
            className={cn(
              'inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold text-white',
              'border border-[var(--cf-border-default)] bg-transparent',
              'hover:bg-[var(--cf-bg-card-hover)] transition-colors',
            )}
          >
            Login
          </Link>
          <Link
            href="/signup"
            className={cn(
              'inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold text-white',
              'border border-[var(--cf-gold-medium)] bg-transparent',
              'hover:bg-[var(--cf-gold-deep)]/20 transition-colors',
            )}
          >
            Create Account
          </Link>
        </div>
      </div>
    </header>
  )
}

function BlockedStateBanner() {
  return (
    <div className="border-b border-[var(--cf-border-subtle)] bg-[#0a1422] px-4 py-2 text-center text-sm text-[var(--cf-green-bright)]">
      Your state allows only Gold Coin play, not Sweepstakes Coins. You can still play and earn
      rewards in GC; SC redemption is disabled.
    </div>
  )
}
