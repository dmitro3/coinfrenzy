'use client'

import * as React from 'react'
import { ArrowLeft, CreditCard, RefreshCcw, ShieldAlert, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { ErrorChip } from './ErrorChip'
import { useKycModal } from './KycModalContext'
import { ShopLoader } from './ShopLoader'
import { useShopModal, type ShopTab } from './ShopModalContext'
import { SuccessCelebration } from './SuccessCelebration'
import { useToast } from './Toast'

// Centered Shop modal — opens via `useShopModal().openShop()`. Matches
// the live coinfrenzy.com Shop popup: compact card with a Buy Coins /
// Redeem tab toggle, a grid of coin packages (Buy tab), or the amount
// + bank picker form (Redeem tab).
//
// Package data is lazy-loaded on first open from `/api/player/packages`
// so the modal stays cheap when the user never clicks SHOP.

export interface ShopPackage {
  id: string
  displayName?: string
  goldCoins: string
  bonusSweeps: string | null
  priceUsd: string
  badge: string | null
  badgeColor?: string | null
  featuredSlot?: number | null
  bannerHeadline?: string | null
  bannerSubhead?: string | null
  bannerImageUrl?: string | null
  welcome?: boolean
}

/**
 * A linked payment instrument the player can redeem to. Banks fund ACH
 * payouts via Finix; debit cards fund instant payouts via APT. Kept
 * polymorphic so the Redeem panel can render both method tiles from
 * the same prop without the caller pre-splitting the list.
 */
export interface PaymentInstrument {
  id: string
  type: 'bank_account' | 'debit_card'
  displayName: string
  bankName: string | null
  accountLast4: string | null
  cardBrand: string | null
  cardLast4: string | null
}

/**
 * @deprecated Use `PaymentInstrument` — kept as an alias so the existing
 * import in `apps/web/app/(player)/_shell.tsx` and any external types
 * keep compiling while the migration is in flight.
 */
export type BankInstrument = PaymentInstrument

/** Shape returned by `GET /api/player/packages`. Re-exported so the
 * apps/web side can type its TanStack Query fetcher against it. */
export interface ShopPackagesData {
  packages: ShopPackage[]
  featured: ShopPackage[]
  welcomeMode: boolean
}

/** Loader-friendly state machine surfaced from the shell. The modal
 * uses this to decide between the Coin Frenzy loader and the full
 * Buy panel. When the data is already cached (warm-cache open) we
 * land directly on `ready` and skip the loader entirely. */
export type ShopPackagesQuery =
  | { status: 'loading' }
  | { status: 'ready'; data: ShopPackagesData }
  | { status: 'error'; refetch: () => void }

interface ShopModalRootProps {
  /** Pre-formatted SC redeemable amount, e.g. "1,250.50". */
  redeemableSc: string
  /** Pre-formatted USD redeemable equivalent, e.g. "$1,250.50". */
  redeemableUsd: string
  /** Pre-formatted *total* SC balance (incl. locked-in-bonus) for the
   * Redeem panel's balance strip. Falls back to `redeemableSc` if the
   * caller doesn't supply it so older mounts keep rendering. */
  totalSc?: string
  /** Whether the player has completed KYC level 2 — required to redeem. */
  kycVerified: boolean
  /** Whether the player's state allows SC redemption. */
  blockedScState: boolean
  /** All linked payment instruments — bank accounts (ACH) and debit
   * cards (APT). The Redeem panel groups them by `type`. */
  instruments: PaymentInstrument[]
  /** Prefetched packages query from the shell. When omitted the modal
   * falls back to its legacy inline fetch so older call sites keep
   * working. */
  packagesQuery?: ShopPackagesQuery
}

export function ShopModalRoot(props: ShopModalRootProps) {
  const { open, tab, setTab, close, immersive } = useShopModal()
  const { packagesQuery } = props

  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    // `.cf-no-scroll` adds overflow:hidden + overscroll-behavior:none +
    // touch-action:none, which together stop iOS Safari from
    // rubber-banding the page underneath an open bottom sheet.
    document.body.classList.add('cf-no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('cf-no-scroll')
    }
  }, [open, close])

  if (!open) return null

  // While packages are still loading we render a compact, loader-only
  // modal — no tabs, no empty grid, no header skeleton. The moment the
  // shell's TanStack Query lands `status: 'ready'` we re-render the
  // full modal underneath; the CSS `cf-shop-content-fade` keyframe
  // crossfades the new content in cleanly. When the data is already
  // cached (warm-cache open) we skip this branch entirely and the
  // user lands on the full modal immediately.
  const isPrefetched = !!packagesQuery
  const isLoadingPackages = isPrefetched && packagesQuery.status === 'loading'

  // The frame becomes a bottom-sheet on mobile (<sm) and a centered
  // card on tablet/desktop (≥sm). On mobile the sheet slides up, has
  // rounded top corners only, occupies the full viewport width, and
  // can grow up to ~88% of the viewport height — leaving the top
  // sliver of the page visible behind the dim so the player keeps
  // their sense of place. Bottom safe-area inset is added so the
  // "Redeem" / "Buy" CTAs don't collide with the iPhone home indicator.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shop"
      data-no-coin-pop="true"
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4 sm:py-6"
    >
      <button
        type="button"
        aria-label="Close shop"
        onClick={close}
        className="cf-shop-modal-overlay-enter cf-sheet-overlay-enter absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      {isLoadingPackages ? (
        <ShopLoaderCard onClose={close} />
      ) : (
        <div
          className={cn(
            // Mobile (<sm): flex-column bottom sheet so the gold strip,
            // drag handle, and header stay fixed at the top while the
            // body fills the remaining space and scrolls. Using a flex
            // layout (instead of `max-h-[calc(...)]`) means the safe-
            // area inset is automatically respected — children flow
            // within whatever the sheet's outer box gives them, so the
            // last package never falls behind the iPhone home indicator
            // or the bottom nav.
            //
            // Cap at 92vh so the player keeps a ~8% peek of the page
            // behind the sheet (preserves sense of place + matches the
            // founder's reference shot which sits flush at the bottom).
            'cf-sheet-enter relative flex w-full max-h-[92vh] flex-col overflow-hidden rounded-t-2xl',
            // Desktop (≥sm): centered card with the original gold-frame
            // entrance and a max-width.
            'sm:cf-shop-modal-enter sm:max-h-[85vh] sm:max-w-xl sm:rounded-xl',
            'border border-[var(--cf-gold-deep)]/40 bg-[var(--cf-bg-card)]',
            // Beefier drop-shadow on mobile gives the "lifted off the
            // surface" feel — the founder called this out specifically.
            'shadow-[0_-12px_60px_rgba(0,0,0,0.8),0_30px_70px_rgba(0,0,0,0.8)]',
          )}
        >
          {/* Premium gold gradient strip at the top of the modal. */}
          <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-transparent via-[var(--cf-gold-light)] to-transparent" />

          {/* Mobile-only drag-handle pip — signals "this can be
              swiped/closed" the way native apps do. */}
          <div className="flex shrink-0 justify-center pt-2 sm:hidden">
            <span
              aria-hidden="true"
              className="h-1 w-10 rounded-full bg-[var(--cf-gray-light)]/30"
            />
          </div>

          <header className="relative shrink-0 overflow-hidden border-b border-[var(--cf-border-subtle)] bg-gradient-to-b from-[#1a1305] to-[var(--cf-bg-card)] px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShopCrestGlyph />
                <h2 className="text-lg font-bold tracking-wide text-white">SHOP</h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Scrollable body — `flex-1 min-h-0` is the trick that makes
              the panel respect the sheet's max-h and overflow gracefully
              instead of pushing the parent taller. The bottom padding
              uses the safe-area inset so the last item / CTA always
              clears the home indicator without a manual `pb` value. */}
          <div
            className={cn(
              'cf-shop-content-fade min-h-0 flex-1 overflow-y-auto px-5 pt-4',
              'pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-5',
            )}
          >
            {/* Tabs hide while the modal is in an immersive flow —
                checkout iframe, payment-declined card, or the
                post-purchase celebration. Switching between Buy /
                Redeem mid-celebration would just break the moment. */}
            {immersive ? null : <ShopTabs tab={tab} onChange={setTab} />}
            {tab === 'buy' ? (
              <BuyCoinsPanel packagesQuery={packagesQuery} />
            ) : (
              <RedeemPanel {...props} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Compact loader card — same gold-rimmed frame as the full modal but
// only the brand crest + Coin Frenzy pile. Lives for the brief moment
// between SHOP click and packages-ready when no warm cache exists.
// Mirrors the parent's mobile/desktop split so the entrance is one
// continuous motion instead of a popup-then-resize lurch.
function ShopLoaderCard({ onClose }: { onClose: () => void }) {
  return (
    <div
      className={cn(
        // Mobile: bottom-sheet shape with safe-area padding inside the
        // flex column so the loader is centred and never clipped.
        // Desktop: centered card with the standard gold-frame entrance.
        'cf-sheet-enter relative flex w-full flex-col overflow-hidden rounded-t-2xl',
        'sm:cf-shop-modal-enter sm:max-w-sm sm:rounded-xl',
        'border border-[var(--cf-gold-deep)]/40 bg-[var(--cf-bg-card)]',
        'shadow-[0_-12px_60px_rgba(0,0,0,0.8),0_30px_70px_rgba(0,0,0,0.8)]',
        'pb-[env(safe-area-inset-bottom,0px)] sm:pb-0',
      )}
    >
      <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-transparent via-[var(--cf-gold-light)] to-transparent" />
      <div className="flex shrink-0 justify-center pt-2 sm:hidden">
        <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[var(--cf-gray-light)]/30" />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-md text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <ShopLoader caption="Loading the shop" size={104} />
    </div>
  )
}

// Small gold crest used in the modal header. Matches the live site's
// shop popup's leading glyph — coin stack on a serif-ringed badge.
function ShopCrestGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="cf-shop-crest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1bf" />
          <stop offset="50%" stopColor="#e6b558" />
          <stop offset="100%" stopColor="#3a2407" />
        </linearGradient>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="#1a1305"
        stroke="url(#cf-shop-crest)"
        strokeWidth="1.5"
      />
      <ellipse cx="16" cy="22" rx="9" ry="2.5" fill="url(#cf-shop-crest)" />
      <ellipse cx="16" cy="17" rx="9" ry="2.5" fill="url(#cf-shop-crest)" />
      <ellipse cx="16" cy="12" rx="9" ry="2.5" fill="url(#cf-shop-crest)" />
    </svg>
  )
}

function ShopTabs({ tab, onChange }: { tab: ShopTab; onChange: (next: ShopTab) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm font-semibold">
      <TabButton active={tab === 'buy'} onClick={() => onChange('buy')}>
        Buy Coins
      </TabButton>
      <TabButton active={tab === 'redeem'} onClick={() => onChange('redeem')}>
        Redeem
      </TabButton>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 items-center justify-center rounded-md border text-center transition-colors',
        active
          ? 'border-[var(--cf-gold-medium)] bg-[#1a1305] text-[var(--cf-gold-light)]'
          : 'border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-[var(--cf-gray-light)] hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

// -------- Buy Coins tab --------

interface CheckoutSession {
  purchaseId: string
  transferId: string
  url: string
  pkg: ShopPackage
}

interface PurchaseCelebration {
  pkg: ShopPackage
}

// Strip commas + non-numeric characters from a friendly package amount
// string and return a Number. "10,000" → 10000, "1.50" → 1.5, "" → 0.
function parseAmountToNumber(value: string | null | undefined): number {
  if (!value) return 0
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

type ShopData = ShopPackagesData

function BuyCoinsPanel({ packagesQuery }: { packagesQuery?: ShopPackagesQuery }) {
  // Legacy fallback: when the shell didn't pass a prefetched query
  // (older call site / a test) we keep the original inline fetch so
  // the modal still works. The shell wires `packagesQuery` for the
  // canonical player flow, which makes this branch dead in production.
  const [legacyState, setLegacyState] = React.useState<
    { kind: 'loading' } | { kind: 'ready'; data: ShopData } | { kind: 'error' }
  >({ kind: 'loading' })
  const [buyingId, setBuyingId] = React.useState<string | null>(null)
  const [checkout, setCheckout] = React.useState<CheckoutSession | null>(null)
  const [celebration, setCelebration] = React.useState<PurchaseCelebration | null>(null)
  // Failed / disputed outcomes used to dump the player out of the
  // modal entirely. Now we capture the decline inline so the recovery
  // card can offer a one-tap retry without losing the package context.
  const [paymentError, setPaymentError] = React.useState<'failed' | 'disputed' | null>(null)
  // Bumped on every retry. Used as the iframe's React key so the
  // hosted-fields surface remounts cleanly each time — clears the
  // mock-vendor's outcome picker, and in real Finix gives the player
  // a fresh form to swap card details into.
  const [retryKey, setRetryKey] = React.useState(0)
  const { close, setImmersive } = useShopModal()
  const toast = useToast()

  // Tell the parent modal when we're in an immersive flow (checkout,
  // declined card, celebration) so it can hide the Buy/Redeem tab
  // strip. We always reset on unmount so a stuck flag never strands
  // the next mount in immersive mode.
  React.useEffect(() => {
    const next = !!checkout || !!celebration
    setImmersive(next)
    return () => setImmersive(false)
  }, [checkout, celebration, setImmersive])

  React.useEffect(() => {
    if (packagesQuery) return // Shell-provided query owns the fetch.
    let cancelled = false
    fetch('/api/player/packages', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('failed')
        const json = (await res.json()) as {
          packages: ShopPackage[]
          featured?: ShopPackage[]
          welcomeMode?: boolean
        }
        if (!cancelled) {
          setLegacyState({
            kind: 'ready',
            data: {
              packages: json.packages,
              featured: json.featured ?? [],
              welcomeMode: json.welcomeMode ?? false,
            },
          })
        }
      })
      .catch(() => {
        if (!cancelled) setLegacyState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [packagesQuery])

  // Normalise the two sources (shell prop vs legacy inline fetch) into
  // a single shape the render code below can switch on.
  const state: { kind: 'loading' } | { kind: 'ready'; data: ShopData } | { kind: 'error' } =
    packagesQuery == null
      ? legacyState
      : packagesQuery.status === 'ready'
        ? { kind: 'ready', data: packagesQuery.data }
        : packagesQuery.status === 'error'
          ? { kind: 'error' }
          : { kind: 'loading' }

  const onBuy = React.useCallback(
    async (pkg: ShopPackage) => {
      setBuyingId(pkg.id)
      try {
        const res = await fetch('/api/player/purchase/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ packageId: pkg.id }),
        })
        const data = (await res.json().catch(() => null)) as {
          url?: string
          purchaseId?: string
          transferId?: string
          error?: string
        } | null
        if (data?.url && data.purchaseId && data.transferId) {
          // Keep checkout INSIDE the modal — render the mock-vendor's
          // checkout page in an iframe with ?embedded=1. The mock page
          // posts a message back here when the player confirms/cancels.
          setCheckout({
            purchaseId: data.purchaseId,
            transferId: data.transferId,
            url: data.url,
            pkg,
          })
        } else if (data?.error) {
          toast.error(data.error, { title: 'Could not start purchase' })
        } else {
          toast.error('Connection problem — please try again.', {
            title: 'Could not start purchase',
          })
        }
      } catch {
        toast.error('Connection problem — please try again.', { title: 'Could not start purchase' })
      } finally {
        setBuyingId(null)
      }
    },
    [toast],
  )

  // Listen for the mock vendor's completion message and react inline —
  // no more `window.location.href = ...` so the modal stays mounted.
  React.useEffect(() => {
    if (!checkout) return
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; outcome?: string } | null
      if (!data?.type) return
      if (data.type === 'coinfrenzy:mock-finix-complete') {
        if (data.outcome === 'succeeded') {
          // Switch the modal to the celebration view. We close the
          // checkout iframe but keep the modal mounted so the player
          // gets a satisfying "you got X" moment before exit.
          // (Effect closure always has `checkout` non-null since the
          // outer guard returned earlier — narrow explicitly for TS.)
          if (!checkout) return
          const pkg = checkout.pkg
          setCheckout(null)
          setPaymentError(null)
          setCelebration({ pkg })
        } else if (data.outcome === 'failed' || data.outcome === 'disputed') {
          // The old behavior dropped a generic toast and closed the
          // whole Shop modal, forcing the player to reopen the shop,
          // re-find their package, and try again. Now we keep the
          // checkout session mounted and surface a friendly recovery
          // card inline (`PaymentDeclinedCard`) so the player can
          // retry in one tap.
          setPaymentError(data.outcome)
        } else {
          // Unexpected outcome — fail safe back to the package grid
          // rather than leave the player staring at a stuck iframe.
          setCheckout(null)
          setPaymentError(null)
        }
      } else if (data.type === 'coinfrenzy:mock-finix-cancel') {
        setCheckout(null)
        setPaymentError(null)
        toast.info('No charge was made.', { title: 'Purchase cancelled' })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [checkout, toast])

  // Show the celebration moment in place of the package grid when a
  // purchase succeeds. The fox cameo + bigger confetti fire automatically
  // for >= $100 packages (see SuccessCelebration).
  if (celebration) {
    const usd = Number.parseFloat(celebration.pkg.priceUsd.replace(/[^0-9.-]/g, '')) || 0
    return (
      <SuccessCelebration
        variant="purchase"
        headline="Coins delivered"
        sub="Thanks for the support — these landed in your wallet."
        gcAmount={parseAmountToNumber(celebration.pkg.goldCoins)}
        scAmount={parseAmountToNumber(celebration.pkg.bonusSweeps ?? '')}
        usdValue={usd}
        onComplete={() => {
          setCelebration(null)
          close()
        }}
      />
    )
  }

  // While the player is on the embedded checkout we hide the package
  // grid entirely and show the iframe + a Back button. Everything in
  // one modal — the live coinfrenzy.com UX.
  if (checkout) {
    return (
      <InlineFinixCheckout
        session={checkout}
        paymentError={paymentError}
        retryKey={retryKey}
        onRetry={() => {
          // Clearing the error reveals the iframe again; the bumped
          // retryKey forces a clean remount so the hosted-fields
          // surface (or mock-vendor outcome picker) resets.
          setPaymentError(null)
          setRetryKey((n) => n + 1)
        }}
        onBack={() => {
          setCheckout(null)
          setPaymentError(null)
        }}
      />
    )
  }

  return (
    <section className="mt-5 space-y-4">
      {/* Daily-bonus marketing strip — matches the live coinfrenzy.com
          shop popup which always shows the "Free 30 SC" / "Claim Daily
          Bonus" promo banner above the package grid. */}
      <DailyFreeStrip />

      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--cf-gold-light)]">
        Coin Packages
      </h3>

      {state.kind === 'loading' && (
        // Legacy-path safety net. The canonical (shell-prefetched) flow
        // never reaches this branch — the modal renders ShopLoaderCard
        // at the frame level instead. But if a caller mounts the modal
        // without `packagesQuery` we still want a branded loader, not
        // grey rectangles.
        <ShopLoader caption="Loading packages" size={88} />
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-6 text-center">
          <p className="text-sm text-[var(--cf-gray-light)]">Couldn&apos;t load coin packages.</p>
          <ErrorChip
            message="Network blip"
            retryLabel="Retry"
            onRetry={() => {
              // Prefer the shell-provided refetch when wired — it shares
              // the TanStack Query cache so other consumers (e.g. the
              // sidebar SHOP button preview) see the fresh data too.
              if (packagesQuery?.status === 'error') {
                packagesQuery.refetch()
                return
              }
              setLegacyState({ kind: 'loading' })
              fetch('/api/player/packages', { cache: 'no-store' })
                .then(async (res) => {
                  if (!res.ok) throw new Error('failed')
                  const json = (await res.json()) as {
                    packages: ShopPackage[]
                    featured?: ShopPackage[]
                    welcomeMode?: boolean
                  }
                  setLegacyState({
                    kind: 'ready',
                    data: {
                      packages: json.packages,
                      featured: json.featured ?? [],
                      welcomeMode: json.welcomeMode ?? false,
                    },
                  })
                })
                .catch(() => setLegacyState({ kind: 'error' }))
            }}
          />
        </div>
      )}

      {state.kind === 'ready' &&
        state.data.packages.length === 0 &&
        state.data.featured.length === 0 && (
          <p className="rounded-md border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-4 text-center text-sm text-[var(--cf-gray-light)]">
            No packages available right now. Free SC entry is always available.{' '}
            <a
              className="text-[var(--cf-gold-light)] underline"
              href="/amoe"
              onClick={() => close()}
            >
              AMOE
            </a>
            .
          </p>
        )}

      {state.kind === 'ready' && state.data.welcomeMode && state.data.packages.length > 0 && (
        <div className="rounded-md border border-[var(--cf-gold-deep)]/40 bg-gradient-to-r from-[#2c1a04] to-[#1a1305] px-4 py-2.5 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--cf-gold-light)]">
            Welcome aboard
          </div>
          <div className="text-xs text-white/85">
            These bundles are first-purchase only — pick one and you&apos;ll unlock the full shop.
          </div>
        </div>
      )}

      {state.kind === 'ready' && state.data.featured.length > 0 && (
        <ul className="grid grid-cols-1 gap-3">
          {state.data.featured.map((pkg) => (
            <li key={pkg.id}>
              <FeaturedBanner pkg={pkg} loading={buyingId === pkg.id} onBuy={() => onBuy(pkg)} />
            </li>
          ))}
        </ul>
      )}

      {state.kind === 'ready' && state.data.packages.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {state.data.packages.map((pkg) => (
            <li key={pkg.id}>
              <PackageTile pkg={pkg} loading={buyingId === pkg.id} onBuy={() => onBuy(pkg)} />
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 text-center text-[10px] text-[var(--cf-gray-light)]">
        No purchase necessary. Sweepstakes Coins always available via{' '}
        <a className="text-[var(--cf-gold-light)] underline" href="/amoe" onClick={() => close()}>
          AMOE
        </a>
        . Void where prohibited.
      </p>
    </section>
  )
}

function InlineFinixCheckout({
  session,
  paymentError,
  retryKey,
  onRetry,
  onBack,
}: {
  session: CheckoutSession
  /** When set, swap the iframe for the recovery card so the player can
   * retry in place instead of being kicked out of the modal. */
  paymentError: 'failed' | 'disputed' | null
  /** Bumped by the parent on retry — used as the iframe's React key
   * so the hosted-fields surface remounts cleanly. */
  retryKey: number
  /** Clears `paymentError` + remounts the iframe. */
  onRetry: () => void
  /** Tear down the checkout session and return to the package grid. */
  onBack: () => void
}) {
  // Inject ?embedded=1 + the package metadata so the mock-vendor page
  // can hide its banner, render the dark theme, and use postMessage
  // instead of full-page redirects.
  const iframeUrl = React.useMemo(() => {
    const url = new URL(session.url)
    url.searchParams.set('embedded', '1')
    url.searchParams.set('theme', 'dark')
    return url.toString()
  }, [session.url])

  return (
    <section className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs font-semibold text-[var(--cf-gold-light)] hover:bg-[var(--cf-bg-card-hover)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="min-w-0 flex-1 text-right">
          <div className="font-mono text-xs font-bold text-white">
            {session.pkg.goldCoins}{' '}
            <span className="text-[10px] text-[var(--cf-gray-light)]">GC</span>
            {session.pkg.bonusSweeps ? (
              <span className="ml-2 text-[var(--cf-green-bright)]">
                + {session.pkg.bonusSweeps} SC
              </span>
            ) : null}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--cf-gray-light)]">
            Secured by Finix
          </div>
        </div>
        <div className="rounded-sm border border-[var(--cf-gold-deep)]/55 bg-[var(--cf-bg-base)] px-2 py-1 font-mono text-sm font-extrabold text-white">
          {session.pkg.priceUsd}
        </div>
      </div>

      {paymentError ? (
        <PaymentDeclinedCard outcome={paymentError} onRetry={onRetry} onCancel={onBack} />
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-base)]">
            <iframe
              key={retryKey}
              src={iframeUrl}
              title="Card capture"
              className="h-[500px] w-full"
              allow="payment"
            />
          </div>

          <p className="px-1 text-center text-[10px] text-[var(--cf-gray-light)]">
            Card details are entered inside our PCI-compliant vendor frame. CoinFrenzy never sees
            your card number.
          </p>
        </>
      )}
    </section>
  )
}

// Friendly inline recovery card shown when the vendor returns a
// failed / disputed outcome. Replaces the iframe in place so the
// player keeps their package context, gets reassurance + a short list
// of common decline reasons, and can retry in one tap. No more
// dumping the player back to the lobby.
function PaymentDeclinedCard({
  outcome,
  onRetry,
  onCancel,
}: {
  outcome: 'failed' | 'disputed'
  onRetry: () => void
  onCancel: () => void
}) {
  // Disputed at checkout time is rare in real Finix (disputes usually
  // surface later via webhook) but treat it as a same-shape decline so
  // the player gets a clear path forward instead of a dead screen.
  const headline = outcome === 'failed' ? 'Card couldn’t be charged' : 'Charge couldn’t complete'

  return (
    <div
      role="alert"
      aria-live="polite"
      className="overflow-hidden rounded-md border border-[var(--cf-gold-deep)]/55 bg-gradient-to-b from-[#1a1305] to-[var(--cf-bg-card)] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.85)]"
    >
      <header className="flex items-start gap-3 border-b border-[var(--cf-border-subtle)] px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--cf-gold-deep)]/55 bg-[#231804] text-[var(--cf-gold-light)]">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">{headline}</h3>
          <p className="mt-0.5 text-xs text-[var(--cf-gray-light)]">
            This happens a lot — your bank probably just needs a quick nudge. Most retries go
            through within a minute.
          </p>
        </div>
      </header>

      <div className="px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cf-gold-light)]">
          Common reasons
        </p>
        <ul className="mt-2 space-y-2 text-xs text-white/85">
          <DeclineReason
            label="Bank security hold"
            body="Open your bank app and approve the CoinFrenzy charge, then retry."
          />
          <DeclineReason
            label="Insufficient available balance"
            body="Pending transactions can reduce available funds — check your balance and retry."
          />
          <DeclineReason
            label="Card details mismatch"
            body="A typo in the card number, expiry, CVV, or ZIP code will block the charge."
          />
          <DeclineReason
            label="Temporary network blip"
            body="The card processor occasionally times out. A second attempt usually clears it."
          />
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--cf-border-subtle)] bg-[var(--cf-bg-base)]/40 px-5 py-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="cf-gold-gradient inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-sm text-sm font-bold uppercase tracking-wider text-[#1a1300]"
        >
          <RefreshCcw className="h-4 w-4" />
          Try this card again
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-[var(--cf-gold-deep)]/55 bg-[var(--cf-bg-elevated)] text-sm font-bold text-white hover:bg-[var(--cf-bg-card-hover)]"
        >
          <CreditCard className="h-4 w-4" />
          Use a different card
        </button>
      </div>

      <div className="border-t border-[var(--cf-border-subtle)] px-5 py-3 text-center">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cf-gray-light)] hover:text-white"
        >
          Cancel and pick a different package
        </button>
      </div>
    </div>
  )
}

function DeclineReason({ label, body }: { label: string; body: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cf-gold-light)]"
      />
      <div>
        <span className="font-bold text-white">{label}.</span>{' '}
        <span className="text-[var(--cf-gray-light)]">{body}</span>
      </div>
    </li>
  )
}

function FeaturedBanner({
  pkg,
  loading,
  onBuy,
}: {
  pkg: ShopPackage
  loading: boolean
  onBuy: () => void
}) {
  // Featured slots are the operator's "look at this thing right now"
  // surface. Bigger card, banner copy on top, optional banner image,
  // brand-coloured border per `badgeColor`.
  const color = (pkg.badgeColor ?? '').toLowerCase()
  const borderClass =
    color === 'red'
      ? 'border-red-500/55 shadow-[0_0_24px_-2px_rgba(239,68,68,0.4)]'
      : color === 'purple'
        ? 'border-violet-500/55 shadow-[0_0_24px_-2px_rgba(168,85,247,0.4)]'
        : color === 'green'
          ? 'border-emerald-500/55 shadow-[0_0_24px_-2px_rgba(16,185,129,0.4)]'
          : color === 'blue'
            ? 'border-sky-500/55 shadow-[0_0_24px_-2px_rgba(56,189,248,0.4)]'
            : color === 'silver'
              ? 'border-slate-400/55 shadow-[0_0_24px_-2px_rgba(148,163,184,0.4)]'
              : 'border-[var(--cf-gold-medium)] shadow-[0_0_24px_-2px_rgba(212,165,61,0.45)]'

  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={loading}
      className={cn(
        'group relative flex w-full items-stretch gap-3 overflow-hidden rounded-md border p-3 text-left',
        'bg-gradient-to-br from-[#1a1305] to-[var(--cf-bg-elevated)]',
        borderClass,
        loading && 'opacity-60',
      )}
    >
      {pkg.bannerImageUrl ? (
        <img
          src={pkg.bannerImageUrl}
          alt=""
          className="hidden h-20 w-20 shrink-0 rounded-md object-cover sm:block"
        />
      ) : (
        <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-md bg-black/40 sm:flex">
          <CoinStackGlyph />
        </div>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        {pkg.badge ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--cf-gold-light)]">
            {pkg.badge}
          </div>
        ) : null}
        <div className="font-mono text-base font-extrabold text-white">
          {pkg.bannerHeadline ?? `${pkg.goldCoins} GC`}
        </div>
        {pkg.bonusSweeps ? (
          <div className="text-sm font-bold text-[var(--cf-green-bright)]">
            + {pkg.bonusSweeps} SC
          </div>
        ) : null}
        {pkg.bannerSubhead ? (
          <div className="mt-0.5 text-xs text-white/75">{pkg.bannerSubhead}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1">
        <div className="rounded-sm border border-[var(--cf-gold-deep)]/55 bg-[var(--cf-bg-base)] px-2 py-1 font-mono text-base font-extrabold text-white">
          {pkg.priceUsd}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--cf-gold-light)]">
          Tap to buy
        </div>
      </div>
    </button>
  )
}

function DailyFreeStrip() {
  return (
    <div
      className={cn(
        'relative flex items-center gap-3 overflow-hidden rounded-md',
        'border border-[var(--cf-gold-medium)]/55 bg-gradient-to-r from-[#2c1a04] via-[#3b260a] to-[#2c1a04]',
        'px-4 py-3',
      )}
    >
      {/* Inner sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />
      <CoinStackGlyph small />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cf-gold-light)]">
          Daily Bonus
        </div>
        <div className="font-mono text-base font-extrabold text-white">
          + FREE 30 SC{' '}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cf-gold-light)]/80">
            on any purchase today
          </span>
        </div>
      </div>
      <span className="hidden shrink-0 rounded-sm bg-[var(--cf-gold-deep)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#1a1300] sm:inline-block">
        Today
      </span>
    </div>
  )
}

function PackageTile({
  pkg,
  loading,
  onBuy,
}: {
  pkg: ShopPackage
  loading: boolean
  onBuy: () => void
}) {
  const isPopular = pkg.badge?.toLowerCase().includes('popular')
  const isBestValue = pkg.badge?.toLowerCase().includes('best')
  const accent = isBestValue ? 'best' : isPopular ? 'popular' : null
  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={loading}
      className={cn(
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-md border p-3 text-left',
        'border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)]',
        'transition-all duration-150 hover:border-[var(--cf-gold-medium)]',
        accent &&
          'border-[var(--cf-gold-medium)] bg-gradient-to-br from-[#1a1305] to-[var(--cf-bg-elevated)] shadow-[0_0_18px_-2px_rgba(212,165,61,0.35)]',
        loading && 'opacity-60',
      )}
    >
      {accent && (
        <span
          className={cn(
            'absolute right-0 top-0 rounded-bl-sm px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider',
            accent === 'best'
              ? 'bg-[var(--cf-green-bright)] text-[#0a2a14]'
              : 'cf-gold-gradient text-[#1a1300]',
          )}
        >
          {pkg.badge}
        </span>
      )}
      <CoinStackGlyph />
      <div className="min-w-0 flex-1 leading-tight">
        {/* Gold-coin line — always rendered. Matches the live
            coinfrenzy.com format: "25,000 GC" in bold gold above the
            green Free-SC line. */}
        <div
          className="font-mono text-sm font-extrabold tabular-nums text-[var(--cf-gold-light)] [text-shadow:0_1px_0_rgba(0,0,0,0.4)]"
          data-numeric="true"
        >
          {pkg.goldCoins}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider">GC</span>
        </div>
        {pkg.bonusSweeps ? (
          <div
            className="font-mono text-[11px] font-semibold tabular-nums text-[var(--cf-green-bright)]"
            data-numeric="true"
          >
            + FREE {pkg.bonusSweeps} SC
          </div>
        ) : null}
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-wider text-[var(--cf-gray-light)]">Price</div>
        <div
          className={cn(
            'rounded-sm border border-[var(--cf-gold-deep)]/50 px-2 py-1 font-mono text-sm font-extrabold tabular-nums',
            'bg-[var(--cf-bg-base)] text-white',
          )}
          data-numeric="true"
        >
          {pkg.priceUsd}
        </div>
      </div>
    </button>
  )
}

// -------- Redeem tab --------

type RedemptionMethod = 'finix_ach' | 'apt_debit'

function RedeemPanel({
  redeemableSc,
  redeemableUsd,
  totalSc,
  kycVerified,
  blockedScState,
  instruments,
}: ShopModalRootProps) {
  // Split instruments by type so each method tile can preview the ones
  // that fund it. The live coinfrenzy.com Shop popup does the same —
  // banks cluster on the ACH row, cards on the debit row.
  const bankInstruments = React.useMemo(
    () => instruments.filter((i) => i.type === 'bank_account'),
    [instruments],
  )
  const debitInstruments = React.useMemo(
    () => instruments.filter((i) => i.type === 'debit_card'),
    [instruments],
  )

  // Method defaults to whichever the player has linked. Bank-first
  // because that's where most volume lands and where the ACH flow
  // ships in v1.
  const initialMethod: RedemptionMethod =
    bankInstruments.length > 0
      ? 'finix_ach'
      : debitInstruments.length > 0
        ? 'apt_debit'
        : 'finix_ach'

  const [method, setMethod] = React.useState<RedemptionMethod>(initialMethod)
  const [amount, setAmount] = React.useState('')
  const [instrumentId, setInstrumentId] = React.useState<string | null>(
    bankInstruments[0]?.id ?? debitInstruments[0]?.id ?? null,
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [celebrationAmount, setCelebrationAmount] = React.useState<number | null>(null)
  const { close } = useShopModal()
  const { openKyc } = useKycModal()
  const toast = useToast()

  // When the player switches method, default-select the first
  // instrument of that type if none is selected for it yet.
  React.useEffect(() => {
    const pool = method === 'finix_ach' ? bankInstruments : debitInstruments
    if (!pool.length) {
      setInstrumentId(null)
      return
    }
    if (!instrumentId || !pool.some((p) => p.id === instrumentId)) {
      setInstrumentId(pool[0]!.id)
    }
  }, [method, bankInstruments, debitInstruments, instrumentId])

  const selectedPool = method === 'finix_ach' ? bankInstruments : debitInstruments
  const canRedeem =
    !blockedScState && kycVerified && selectedPool.length > 0 && instrumentId != null

  const submit = async () => {
    // Defensive popup: if the player taps Redeem without KYC (e.g. the
    // inline notice scrolled out of view) we route them straight to
    // the Footprint flow instead of silently 400ing on the API.
    if (!kycVerified) {
      close()
      openKyc({ reason: 'Required to redeem Sweepstakes Coins' })
      return
    }
    if (!canRedeem || !instrumentId || !amount) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/player/redemptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          paymentInstrumentId: instrumentId,
          amountSc: amount,
          method,
        }),
      })
      if (res.ok) {
        toast.success(
          method === 'finix_ach'
            ? `${amount} SC is on its way to your linked bank. We'll email you once it clears review.`
            : `${amount} SC headed to your debit card — should land within minutes.`,
          { title: 'Redemption requested' },
        )
        setCelebrationAmount(parseAmountToNumber(amount))
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? 'Please double-check the amount and try again.', {
          title: 'Could not start redemption',
        })
      }
    } catch {
      toast.error('Connection problem — please try again.', {
        title: 'Could not start redemption',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (celebrationAmount !== null) {
    return (
      <SuccessCelebration
        variant="claim"
        headline="Redemption requested"
        sub="We'll email you the moment it clears compliance review."
        scAmount={celebrationAmount}
        onComplete={() => {
          setCelebrationAmount(null)
          close()
        }}
      />
    )
  }

  return (
    <section className="mt-5 space-y-4">
      {/* "Select Redeem Method" — matches the live coinfrenzy.com Shop
          popup's method picker. Each tile previews the linked
          instruments as stacked initial badges so the player sees at a
          glance which banks / cards they already have on file. */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--cf-gold-light)]">
          Select Redeem Method
        </p>
        <div className="space-y-2">
          <MethodTile
            label="Bank Account"
            sublabel="ACH · 1–3 business days"
            instruments={bankInstruments}
            kind="bank"
            selected={method === 'finix_ach'}
            onSelect={() => setMethod('finix_ach')}
          />
          <MethodTile
            label="Debit Card"
            sublabel="APT · Instant payout"
            instruments={debitInstruments}
            kind="card"
            selected={method === 'apt_debit'}
            onSelect={() => setMethod('apt_debit')}
          />
        </div>
      </div>

      {/* Specific instrument selector for the chosen method — collapsed
          single-row when there's only one linked, radio list when
          there are multiple, dashed "+ Add" CTA when there are none. */}
      <InstrumentSelector
        kind={method === 'finix_ach' ? 'bank' : 'card'}
        instruments={selectedPool}
        selectedId={instrumentId}
        onSelect={setInstrumentId}
        onAdd={() => {
          close()
          window.location.href =
            method === 'finix_ach' ? '/cashier/redeem#add-bank' : '/cashier/redeem#add-card'
        }}
      />

      {/* Amount + MAX */}
      <div className="rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="redeem-amount" className="text-sm font-bold text-white">
            Redeem Your Amount{' '}
            <span className="ml-1 text-[var(--cf-gold-light)]">
              ( Max Amount : {redeemableSc} )
            </span>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            id="redeem-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Amount"
            inputMode="decimal"
            className="flex-1 rounded-sm border border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--cf-gray-light)] focus:border-[var(--cf-gold-medium)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setAmount(redeemableSc.replace(/,/g, ''))}
            className="cf-gold-gradient rounded-sm px-4 text-sm font-bold uppercase tracking-wider"
          >
            Max
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[var(--cf-gray-light)]">≈ {redeemableUsd} USD</p>
      </div>

      {/* Balance strip — matches the live site's "SC : X | Redeemable
          SC : Y" presentation so the player sees their total and the
          available-to-redeem subset side by side. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-4 py-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-bold uppercase tracking-wider text-white">SC&nbsp;:</span>
          <span
            className="font-mono font-extrabold text-[var(--cf-green-bright)]"
            data-numeric="true"
          >
            {totalSc ?? redeemableSc} SC
          </span>
        </div>
        <span
          className="hidden h-4 w-px bg-[var(--cf-border-default)] sm:inline-block"
          aria-hidden="true"
        />
        <div className="flex items-center gap-1.5">
          <span className="font-bold uppercase tracking-wider text-white">
            Redeemable SC&nbsp;:
          </span>
          <span
            className="font-mono font-extrabold text-[var(--cf-green-bright)]"
            data-numeric="true"
          >
            {redeemableSc} SC
          </span>
        </div>
      </div>

      {!kycVerified && (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--cf-gold-deep)] bg-[#231804] p-3 text-xs text-[var(--cf-gold-light)] sm:flex-row sm:items-center sm:justify-between">
          <p>Level 2 identity verification is required before SC can be redeemed.</p>
          <button
            type="button"
            onClick={() => {
              // Close the Shop modal first so the KYC popup owns the
              // overlay — two stacked modals would fight for focus and
              // body scroll lock.
              close()
              openKyc({ reason: 'Required to redeem Sweepstakes Coins' })
            }}
            className="cf-gold-gradient inline-flex h-8 shrink-0 items-center justify-center rounded-sm px-3 text-[11px] font-bold uppercase tracking-wider text-[#1a1a1a]"
          >
            Verify now
          </button>
        </div>
      )}

      {blockedScState && (
        <p className="rounded-md border border-[var(--cf-red-dark)] bg-[#2a0608] p-3 text-xs text-[var(--cf-gold-light)]">
          Your state allows Gold Coin play only — SC redemption is disabled in this jurisdiction.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={close}
          className="h-11 rounded-sm border border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] text-sm font-bold text-white hover:bg-[var(--cf-bg-card-hover)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={(kycVerified && (!canRedeem || !amount)) || submitting}
          className="cf-gold-gradient h-11 rounded-sm text-sm font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Redeem'}
        </button>
      </div>
    </section>
  )
}

// -------- Redeem helpers --------

interface MethodTileProps {
  label: string
  sublabel: string
  instruments: PaymentInstrument[]
  kind: 'bank' | 'card'
  selected: boolean
  onSelect: () => void
}

// Single-row method tile that previews the linked instruments as
// stacked colored initial badges (overlap slightly) followed by the
// method label and a selection radio. Mirrors the live site's
// "[C][B][W] Bank Account ›" treatment.
function MethodTile({ label, sublabel, instruments, kind, selected, onSelect }: MethodTileProps) {
  const hasAny = instruments.length > 0
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors',
        selected
          ? 'border-[var(--cf-gold-medium)] bg-gradient-to-r from-[#1a1305] to-[var(--cf-bg-elevated)] shadow-[0_0_18px_-2px_rgba(212,165,61,0.35)]'
          : 'border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] hover:border-[var(--cf-gold-medium)]/60',
      )}
      aria-pressed={selected}
    >
      <InstrumentBadgeStack instruments={instruments} kind={kind} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-bold text-white">{label}</div>
        <div className="text-[11px] text-[var(--cf-gray-light)]">
          {hasAny ? sublabel : `${sublabel} · none linked yet`}
        </div>
      </div>
      <span
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
          selected
            ? 'border-[var(--cf-gold-light)] bg-[var(--cf-gold-deep)]'
            : 'border-[var(--cf-border-default)] bg-transparent',
        )}
        aria-hidden="true"
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-[var(--cf-gold-light)]" /> : null}
      </span>
    </button>
  )
}

// Up to three overlapping coloured badges showing the instruments
// linked to a method. Empty state shows a single dashed slot so the
// tile keeps its visual rhythm even before the player has linked
// anything.
function InstrumentBadgeStack({
  instruments,
  kind,
}: {
  instruments: PaymentInstrument[]
  kind: 'bank' | 'card'
}) {
  if (instruments.length === 0) {
    return (
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] text-[10px] font-bold text-[var(--cf-gray-light)]"
        aria-hidden="true"
      >
        +
      </div>
    )
  }
  const shown = instruments.slice(0, 3)
  const overflow = instruments.length - shown.length
  return (
    <div className="flex shrink-0 items-center">
      {shown.map((inst, idx) => (
        <InstrumentBadge
          key={inst.id}
          instrument={inst}
          kind={kind}
          className={idx > 0 ? '-ml-2 ring-2 ring-[var(--cf-bg-base)]' : ''}
        />
      ))}
      {overflow > 0 ? (
        <span
          className="-ml-2 grid h-9 w-9 place-items-center rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-[10px] font-bold text-white ring-2 ring-[var(--cf-bg-base)]"
          aria-hidden="true"
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

// Single brand-coloured badge with the instrument's initials. Colors
// are derived from a small hash of the bank / card brand name so
// different banks visually distinguish themselves without us hand-
// maintaining a logo map.
function InstrumentBadge({
  instrument,
  kind,
  className,
}: {
  instrument: PaymentInstrument
  kind: 'bank' | 'card'
  className?: string
}) {
  const name =
    kind === 'bank'
      ? (instrument.bankName ?? instrument.displayName ?? 'Bank')
      : (instrument.cardBrand ?? instrument.displayName ?? 'Card')
  const initials = nameInitials(name)
  const { bg, fg } = brandPalette(name)
  return (
    <span
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-md text-[10px] font-extrabold tracking-tighter',
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      aria-label={name}
    >
      {initials}
    </span>
  )
}

interface InstrumentSelectorProps {
  kind: 'bank' | 'card'
  instruments: PaymentInstrument[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

// The detail picker shown below the chosen method tile. Renders a
// single-row "selected" pill when only one instrument exists (the
// common case for v1) and an expandable radio list when there are
// multiple. Falls back to a dashed "+ Add" CTA when the player has
// nothing linked for the chosen method.
function InstrumentSelector({
  kind,
  instruments,
  selectedId,
  onSelect,
  onAdd,
}: InstrumentSelectorProps) {
  if (instruments.length === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] text-sm font-semibold text-white hover:border-[var(--cf-gold-medium)]"
      >
        + Add {kind === 'bank' ? 'Bank Account' : 'Debit Card'}
      </button>
    )
  }
  if (instruments.length === 1) {
    const only = instruments[0]!
    return (
      <InstrumentRow instrument={only} kind={kind} selected onClick={() => onSelect(only.id)} />
    )
  }
  return (
    <ul className="space-y-2">
      {instruments.map((inst) => (
        <li key={inst.id}>
          <InstrumentRow
            instrument={inst}
            kind={kind}
            selected={selectedId === inst.id}
            onClick={() => onSelect(inst.id)}
          />
        </li>
      ))}
    </ul>
  )
}

function InstrumentRow({
  instrument,
  kind,
  selected,
  onClick,
}: {
  instrument: PaymentInstrument
  kind: 'bank' | 'card'
  selected: boolean
  onClick: () => void
}) {
  const subline =
    kind === 'bank'
      ? `${instrument.bankName ?? 'Bank'}${instrument.accountLast4 ? ` · ****${instrument.accountLast4}` : ''}`
      : `${instrument.cardBrand ?? 'Card'}${instrument.cardLast4 ? ` · ****${instrument.cardLast4}` : ''}`
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors',
        selected
          ? 'border-[var(--cf-gold-medium)] bg-[#1a1305]'
          : 'border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] hover:border-[var(--cf-gold-medium)]/60',
      )}
      aria-pressed={selected}
    >
      <InstrumentBadge instrument={instrument} kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-white">{instrument.displayName}</div>
        <div className="truncate text-xs text-[var(--cf-gray-light)]">{subline}</div>
      </div>
      <span
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
          selected
            ? 'border-[var(--cf-gold-light)] bg-[var(--cf-gold-deep)]'
            : 'border-[var(--cf-border-default)]',
        )}
        aria-hidden="true"
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-[var(--cf-gold-light)]" /> : null}
      </span>
    </button>
  )
}

// Up to two uppercase initials from a name — "Bank of America" → "BA",
// "Chase" → "C", "Visa" → "V". Trims punctuation so "WF" stays "WF".
function nameInitials(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase()
  }
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

// Deterministic per-brand colour. Hashing the name picks one of a
// small CoinFrenzy-tuned palette so different banks visually
// distinguish themselves without us shipping a real bank-logo map.
const BRAND_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#0F2A5F', fg: '#E4F0FF' }, // navy (Chase-like)
  { bg: '#A21F2B', fg: '#FFE9E9' }, // red (BoA / WF-like)
  { bg: '#16652A', fg: '#E6FFEB' }, // green (Capital One-like)
  { bg: '#0E6CB8', fg: '#E4F4FF' }, // bright blue
  { bg: '#723790', fg: '#F5E6FF' }, // violet
  { bg: '#B26200', fg: '#FFEFD8' }, // amber
]

function brandPalette(name: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return BRAND_PALETTE[h % BRAND_PALETTE.length]!
}

function CoinStackGlyph({ small = false }: { small?: boolean }) {
  const size = small ? 36 : 44
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
    >
      <defs>
        <linearGradient id={`shop-coin-side-${small ? 'sm' : 'md'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce5a8" />
          <stop offset="50%" stopColor="#c69032" />
          <stop offset="100%" stopColor="#3a2407" />
        </linearGradient>
        <linearGradient id={`shop-coin-top-${small ? 'sm' : 'md'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1bf" />
          <stop offset="50%" stopColor="#e6b558" />
          <stop offset="100%" stopColor="#8a5f17" />
        </linearGradient>
      </defs>
      <ellipse
        cx="24"
        cy="38"
        rx="18"
        ry="5.5"
        fill={`url(#shop-coin-side-${small ? 'sm' : 'md'})`}
      />
      <ellipse cx="24" cy="35" rx="18" ry="5.5" fill="#1a0c02" stroke="#8a5f17" strokeWidth="0.8" />
      <ellipse
        cx="24"
        cy="29"
        rx="18"
        ry="5.5"
        fill={`url(#shop-coin-side-${small ? 'sm' : 'md'})`}
      />
      <ellipse cx="24" cy="26" rx="18" ry="5.5" fill="#1a0c02" stroke="#8a5f17" strokeWidth="0.8" />
      <ellipse
        cx="24"
        cy="20"
        rx="18"
        ry="5.5"
        fill={`url(#shop-coin-side-${small ? 'sm' : 'md'})`}
      />
      <ellipse cx="24" cy="17" rx="18" ry="5.5" fill="#1a0c02" stroke="#8a5f17" strokeWidth="0.8" />
      <ellipse
        cx="24"
        cy="11"
        rx="18"
        ry="5.5"
        fill={`url(#shop-coin-top-${small ? 'sm' : 'md'})`}
        stroke="#fce5a8"
        strokeWidth="0.5"
        strokeOpacity="0.55"
      />
      {/* Polished top reflection */}
      <ellipse cx="20" cy="9.2" rx="6.5" ry="1.5" fill="#fff5d0" opacity="0.6" />
    </svg>
  )
}
