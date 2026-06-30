'use client'

import * as React from 'react'
import { Crown, Gift, Info, Lock, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { useIsMobile } from './motion-primitives'
import { SuccessCelebration } from './SuccessCelebration'
import { useToast } from './Toast'

// Available Rewards popover — opened from the lightning-bolt button in
// the top bar. Two tiles:
//
//   DAILY BONUS — 10,000 GC + 1 SC, rolling 24h cooldown counting down
//   from the moment the player claims (not from UTC midnight). The
//   countdown ticks to the second.
//
//   PENDING BONUS — admin-granted bonuses (3x playthrough by default),
//   Frenzy Creator affiliate payouts (no playthrough, immediate),
//   promo-code awards routed to the inbox, anything else that should
//   land here for explicit acceptance. Coins land in the wallet ONLY
//   after the player clicks Claim.
//
// State + claim go through:
//   GET  /api/player/bonus/state                       → daily state
//   POST /api/player/bonus/claim-daily                 → claim daily
//   GET  /api/player/bonus/pending                     → pending list
//   POST /api/player/bonus/pending/:awardId/claim      → claim pending
//   POST /api/player/promo/redeem                      → promo code

interface RewardsPopoverProps {
  open: boolean
  onClose: () => void
  /** Anchor element rect for positioning (top-right of the trigger). */
  anchorRect: DOMRect | null
}

interface DailyState {
  claimable: boolean
  cooldownSecondsRemaining: number | null
  cooldownTotalSeconds: number
  nextClaimableAt: string | null
  awardGc: string
  awardSc: string
}

interface PendingBonus {
  awardId: string
  bonusSlug: string
  bonusName: string
  bonusType: string
  gc: string
  sc: string
  sourceLabel: string
  hasPlaythrough: boolean
  playthroughMultiplier: number
  awardReason: string | null
  createdAt: string
}

type Selected = 'daily' | { kind: 'pending'; awardId: string } | null

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; daily: DailyState; pending: PendingBonus[]; fetchedAt: number }
  | { kind: 'error'; message: string }

interface CelebrationView {
  variant: 'claim' | 'promo'
  headline: string
  sub?: string
  gcAmount: number
  scAmount: number
}

function parseAwardToNumber(value: string | undefined): number {
  if (!value) return 0
  const cleaned = value.replace(/,/g, '').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function formatHms(seconds: number): string {
  if (seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function RewardsPopover({ open, onClose, anchorRect }: RewardsPopoverProps) {
  const toast = useToast()
  const isMobile = useIsMobile()
  const [state, setState] = React.useState<FetchState>({ kind: 'loading' })
  const [selected, setSelected] = React.useState<Selected>('daily')
  const [code, setCode] = React.useState('')
  const [claiming, setClaiming] = React.useState(false)
  const [redeemingCode, setRedeemingCode] = React.useState(false)
  const [celebration, setCelebration] = React.useState<CelebrationView | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [now, setNow] = React.useState(Date.now())

  // Tick once a second while the popover is open + on cooldown so the
  // countdown updates without re-fetching the API.
  React.useEffect(() => {
    if (!open) return
    if (state.kind !== 'ready') return
    if (state.daily.claimable) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open, state])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ kind: 'loading' })
    Promise.all([
      fetch('/api/player/bonus/state', { cache: 'no-store' }).then((res) => {
        if (!res.ok) throw new Error(`state HTTP ${res.status}`)
        return res.json() as Promise<{ daily: DailyState }>
      }),
      fetch('/api/player/bonus/pending', { cache: 'no-store' }).then((res) => {
        if (!res.ok) throw new Error(`pending HTTP ${res.status}`)
        return res.json() as Promise<{ pending: PendingBonus[] }>
      }),
    ])
      .then(([s, p]) => {
        if (cancelled) return
        setState({ kind: 'ready', daily: s.daily, pending: p.pending, fetchedAt: Date.now() })
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Could not load rewards.',
          })
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Auto-select the first pending bonus if daily is on cooldown — gives
  // the player a meaningful action when they open the popover.
  React.useEffect(() => {
    if (state.kind !== 'ready') return
    if (state.daily.claimable) {
      setSelected('daily')
      return
    }
    if (state.pending.length > 0) {
      setSelected({ kind: 'pending', awardId: state.pending[0]!.awardId })
    }
  }, [state])

  // Close on outside-click + ESC. On mobile (bottom-sheet) we add a
  // body lock too so the page behind doesn't rubber-band.
  React.useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current) return
      if (containerRef.current.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    if (isMobile) document.body.classList.add('cf-no-scroll')
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('cf-no-scroll')
    }
  }, [open, onClose, isMobile])

  if (!open) return null

  // Position the popover anchored to the trigger button on desktop;
  // on mobile (<sm) we render a bottom-sheet that ignores the anchor.
  // Falls back to a sensible default when the anchor rect isn't
  // available yet (e.g. an external open via ?openRewards=1).
  const top = anchorRect ? anchorRect.bottom + 8 : 64
  const right = anchorRect ? Math.max(12, window.innerWidth - anchorRect.right) : 16

  const onClaimDaily = async () => {
    if (state.kind !== 'ready' || !state.daily.claimable) return
    setClaiming(true)
    try {
      const res = await fetch('/api/player/bonus/claim-daily', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        awarded?: boolean
        gc?: string
        sc?: string
        error?: string
        message?: string
        retrySeconds?: number
      }
      if (!res.ok || !body.awarded) {
        toast.error(body.message ?? body.error ?? 'Daily bonus is unavailable right now.', {
          title: 'Not claimed',
        })
        // If the server tells us the actual retry-after, snap the
        // local cooldown to match so the UI doesn't lie.
        if (typeof body.retrySeconds === 'number') {
          setState({
            kind: 'ready',
            daily: {
              ...state.daily,
              claimable: false,
              cooldownSecondsRemaining: body.retrySeconds,
              nextClaimableAt: new Date(Date.now() + body.retrySeconds * 1000).toISOString(),
            },
            pending: state.pending,
            fetchedAt: Date.now(),
          })
        }
        return
      }
      // Flip the tile to cooldown immediately. Total = configured 24h
      // (or whatever the operator set on the template).
      setState({
        kind: 'ready',
        daily: {
          ...state.daily,
          claimable: false,
          cooldownSecondsRemaining: state.daily.cooldownTotalSeconds,
          nextClaimableAt: new Date(
            Date.now() + state.daily.cooldownTotalSeconds * 1000,
          ).toISOString(),
        },
        pending: state.pending,
        fetchedAt: Date.now(),
      })
      setCelebration({
        variant: 'claim',
        headline: 'Bonus claimed',
        sub: 'Coins are in your wallet — happy spinning.',
        gcAmount: parseAwardToNumber(body.gc),
        scAmount: parseAwardToNumber(body.sc),
      })
      const parts: string[] = []
      if (body.gc) parts.push(`${body.gc} GC`)
      if (body.sc) parts.push(`${body.sc} SC`)
      toast.success(parts.length > 0 ? `+ ${parts.join(' + ')}` : 'Bonus added to your wallet.', {
        title: 'Bonus successfully claimed',
      })
    } catch {
      toast.error('Connection problem — please try again.', { title: 'Could not claim' })
    } finally {
      setClaiming(false)
    }
  }

  const onClaimPending = async (awardId: string) => {
    if (state.kind !== 'ready') return
    const target = state.pending.find((b) => b.awardId === awardId)
    if (!target) return
    setClaiming(true)
    try {
      const res = await fetch(`/api/player/bonus/pending/${awardId}/claim`, { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        claimed?: boolean
        gc?: string
        sc?: string
        bonusName?: string
        message?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(body.message ?? body.error ?? 'Could not claim that bonus.', {
          title: 'Not claimed',
        })
        return
      }
      // Drop the row out of the local pending list whether the server
      // reports `claimed` or `duplicate` — either way it's not pending
      // anymore.
      const remaining = state.pending.filter((b) => b.awardId !== awardId)
      setState({
        kind: 'ready',
        daily: state.daily,
        pending: remaining,
        fetchedAt: Date.now(),
      })
      // Auto-move the selection to either the next pending bonus or
      // the daily tile.
      if (remaining.length > 0) {
        setSelected({ kind: 'pending', awardId: remaining[0]!.awardId })
      } else {
        setSelected('daily')
      }
      setCelebration({
        variant: 'claim',
        headline: body.bonusName ?? target.bonusName,
        sub: target.sourceLabel + ' — coins are in your wallet.',
        gcAmount: parseAwardToNumber(body.gc ?? target.gc),
        scAmount: parseAwardToNumber(body.sc ?? target.sc),
      })
      const parts: string[] = []
      if (body.gc) parts.push(`${body.gc} GC`)
      if (body.sc) parts.push(`${body.sc} SC`)
      toast.success(parts.length > 0 ? `+ ${parts.join(' + ')}` : 'Bonus added to your wallet.', {
        title: 'Bonus successfully claimed',
      })
    } catch {
      toast.error('Connection problem — please try again.', { title: 'Could not claim' })
    } finally {
      setClaiming(false)
    }
  }

  const onRedeemCode = async () => {
    const trimmed = code.trim()
    if (!trimmed) return
    setRedeemingCode(true)
    try {
      const res = await fetch('/api/player/promo/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        message?: string
        awardStatus?: string
        gc?: string
        sc?: string
      }
      if (res.ok && body.awardStatus) {
        setCode('')
        setCelebration({
          variant: 'promo',
          headline: 'Code redeemed',
          sub: `Code "${trimmed}" added to your wallet.`,
          gcAmount: parseAwardToNumber(body.gc),
          scAmount: parseAwardToNumber(body.sc),
        })
        toast.success(`Code "${trimmed}" applied.`, { title: 'Bonus successfully claimed' })
      } else {
        toast.error(body.message ?? body.error ?? 'That code is not valid.', {
          title: 'Code rejected',
        })
      }
    } catch {
      toast.error('Connection problem — please try again.', { title: 'Could not apply code' })
    } finally {
      setRedeemingCode(false)
    }
  }

  // Footer button reflects the currently-selected tile.
  let footerLabel = 'Select a Bonus to Claim'
  let footerEnabled = false
  let footerOnClick: (() => void) | undefined = undefined

  if (state.kind === 'ready') {
    if (selected === 'daily') {
      if (state.daily.claimable) {
        footerLabel = claiming ? 'Claiming…' : 'Claim Daily Bonus'
        footerEnabled = !claiming
        footerOnClick = onClaimDaily
      } else if (state.daily.cooldownSecondsRemaining !== null) {
        const elapsed = Math.max(0, Math.floor((now - state.fetchedAt) / 1000))
        footerLabel = formatHms(state.daily.cooldownSecondsRemaining - elapsed)
        footerEnabled = false
      }
    } else if (selected && typeof selected === 'object' && selected.kind === 'pending') {
      const target = state.pending.find((b) => b.awardId === selected.awardId)
      if (target) {
        footerLabel = claiming ? 'Claiming…' : `Claim ${target.bonusName}`
        footerEnabled = !claiming
        footerOnClick = () => onClaimPending(target.awardId)
      }
    }
  }

  const pendingCount = state.kind === 'ready' ? state.pending.length : 0
  const firstPending = state.kind === 'ready' ? (state.pending[0] ?? null) : null

  // The body (header + form + tiles + footer) is identical whether the
  // popover lives in a bottom-sheet or an anchored dropdown. We
  // build it once and inject it into whichever shell matches the
  // viewport — avoids 80 lines of duplicated JSX.
  const body = (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--cf-gold-light)] to-transparent"
      />
      <header className="flex items-center justify-between border-b border-[var(--cf-border-subtle)] bg-gradient-to-b from-[#1a1305] to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <Crown className="h-[18px] w-[18px] text-[var(--cf-gold-light)]" aria-hidden="true" />
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-white">
            Available Rewards
          </h2>
          <button
            type="button"
            aria-label="About rewards"
            className="grid h-5 w-5 place-items-center rounded-full text-[var(--cf-gray-light)] hover:text-[var(--cf-gold-light)]"
          >
            <Info className="h-[14px] w-[14px]" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {celebration ? (
        <SuccessCelebration
          headline={celebration.headline}
          sub={celebration.sub}
          gcAmount={celebration.gcAmount}
          scAmount={celebration.scAmount}
          variant={celebration.variant}
          onComplete={() => {
            setCelebration(null)
            onClose()
          }}
        />
      ) : (
        <div className="space-y-3 px-4 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onRedeemCode()
            }}
            className="flex items-center gap-2"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter Bonus Code"
              spellCheck={false}
              autoCapitalize="characters"
              className={cn(
                'h-10 min-w-0 flex-1 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] px-3',
                'text-sm text-white placeholder:text-[var(--cf-gray-light)]/80',
                'focus:border-[var(--cf-gold-medium)] focus:outline-none',
              )}
            />
            <button
              type="submit"
              disabled={!code.trim() || redeemingCode}
              className={cn(
                'cf-gold-gradient inline-flex h-10 items-center justify-center rounded-md px-4',
                'text-xs font-extrabold uppercase tracking-[0.16em] text-[#1a1300]',
                'transition-all duration-200',
                !code.trim() || redeemingCode
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-8px_rgba(245,208,102,0.55)]',
              )}
            >
              {redeemingCode ? '…' : 'Claim'}
            </button>
          </form>

          <div className="grid grid-cols-2 gap-3">
            <DailyBonusTile
              state={state}
              now={now}
              selected={selected === 'daily'}
              onSelect={() => setSelected('daily')}
            />
            <PendingBonusTile
              count={pendingCount}
              first={firstPending}
              loading={state.kind === 'loading'}
              selected={
                selected !== null && typeof selected === 'object' && selected.kind === 'pending'
              }
              selectedAwardId={
                selected !== null && typeof selected === 'object' && selected.kind === 'pending'
                  ? selected.awardId
                  : null
              }
              onSelect={(awardId) => setSelected({ kind: 'pending', awardId })}
            />
          </div>

          <button
            type="button"
            disabled={!footerEnabled}
            onClick={footerOnClick}
            className={cn(
              'inline-flex h-12 w-full items-center justify-center rounded-md text-sm font-extrabold uppercase tracking-[0.16em]',
              'transition-all duration-200',
              footerEnabled
                ? 'cf-gold-gradient text-[#1a1300] hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-8px_rgba(245,208,102,0.55)]'
                : 'border border-[var(--cf-gold-deep)]/40 bg-[#1a1305] text-[var(--cf-gold-light)]/65',
            )}
          >
            {footerLabel}
          </button>
        </div>
      )}
    </>
  )

  // Mobile (<sm): full-width bottom-sheet with its own dim overlay.
  // The overlay is a button so a tap anywhere outside the sheet
  // dismisses it — same pattern as iOS share sheets, Google Maps,
  // etc. A drag-handle pip at the top signals "swipeable" even
  // though we don't wire actual drag-to-dismiss (overkill for a
  // sheet that's already easy to close).
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label="Close rewards"
          onClick={onClose}
          className="cf-sheet-overlay-enter fixed inset-0 z-[69] bg-black/70 backdrop-blur-md"
        />
        <div
          role="dialog"
          aria-label="Available rewards"
          ref={containerRef}
          className={cn(
            'cf-sheet-enter fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-md',
            'overflow-hidden rounded-t-2xl border border-[var(--cf-gold-deep)]/45',
            'bg-[var(--cf-bg-card)] shadow-[0_-20px_60px_rgba(0,0,0,0.85)]',
            'pb-[env(safe-area-inset-bottom,0px)]',
            'cf-rewards-popover',
          )}
        >
          <div className="flex justify-center pt-2">
            <span
              aria-hidden="true"
              className="h-1 w-10 rounded-full bg-[var(--cf-gray-light)]/30"
            />
          </div>
          {body}
        </div>
      </>
    )
  }

  // Desktop (≥sm): anchored dropdown positioned next to the trigger
  // button via the captured rect. No backdrop — outside-click dismiss
  // already covers it.
  return (
    <div
      role="dialog"
      aria-label="Available rewards"
      ref={containerRef}
      style={{ top, right }}
      className={cn(
        'fixed z-[70] w-[min(360px,calc(100vw-1.5rem))]',
        'overflow-hidden rounded-xl border border-[var(--cf-gold-deep)]/45',
        'bg-[var(--cf-bg-card)] shadow-[0_30px_70px_rgba(0,0,0,0.85)]',
        'cf-rewards-popover',
      )}
    >
      {body}
    </div>
  )
}

function DailyBonusTile({
  state,
  now,
  selected,
  onSelect,
}: {
  state: FetchState
  now: number
  selected: boolean
  onSelect: () => void
}) {
  const ready = state.kind === 'ready'
  const claimable = ready && state.daily.claimable
  const elapsedSec = ready ? Math.max(0, Math.floor((now - state.fetchedAt) / 1000)) : 0
  const cooldownLeft =
    ready && state.daily.cooldownSecondsRemaining !== null
      ? Math.max(0, state.daily.cooldownSecondsRemaining - elapsedSec)
      : null

  // While the daily is on cooldown we render the tile as a static div
  // (not a button). The cooldown is already visible on the tile itself,
  // and the previous behavior — clicking the locked tile selected it
  // and hijacked the footer with the timer, even when a pending bonus
  // was sitting right next to it ready to claim. Mirrors the same
  // div-when-empty pattern used by `PendingBonusTile` below.
  const sharedTileClass = cn(
    'group relative flex flex-col items-center gap-1.5 rounded-md border bg-[var(--cf-bg-elevated)] p-3 text-center transition-all duration-200',
    claimable
      ? selected
        ? 'border-[var(--cf-gold-medium)] shadow-[inset_0_1px_0_rgba(255,245,200,0.10),0_0_20px_-4px_rgba(245,208,102,0.40)] cursor-pointer'
        : 'border-[var(--cf-border-default)] hover:border-[var(--cf-gold-medium)]/60 cursor-pointer'
      : 'border-[var(--cf-border-default)] opacity-80',
  )

  const content = (
    <>
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-full transition-colors',
          claimable
            ? 'bg-[var(--cf-gold-deep)]/25 text-[var(--cf-gold-light)]'
            : 'bg-[var(--cf-bg-base)] text-[var(--cf-gray-light)]',
        )}
      >
        {claimable ? <Crown className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
      </span>
      <div
        className={cn(
          'text-[11px] font-bold uppercase tracking-[0.12em]',
          claimable ? 'text-white' : 'text-[var(--cf-gray-light)]',
        )}
      >
        Daily Bonus
      </div>
      {state.kind === 'loading' && (
        <div className='text-[10px] tabular-nums text-[var(--cf-gray-light)] [font-feature-settings:"tnum"_1]'>
          Loading…
        </div>
      )}
      {state.kind === 'error' && (
        <div className="text-[10px] text-[var(--cf-red-primary)]">Try again later</div>
      )}
      {ready && claimable && (
        <div className='text-[11px] font-bold tabular-nums text-[var(--cf-gold-light)] [font-feature-settings:"tnum"_1]'>
          {state.daily.awardGc} GC <span className="cf-sc-shine">+ {state.daily.awardSc} SC</span>
        </div>
      )}
      {ready && !claimable && cooldownLeft !== null && (
        <div className='text-[11px] font-bold tabular-nums text-[var(--cf-gray-light)] [font-feature-settings:"tnum"_1]'>
          {formatHms(cooldownLeft)}
        </div>
      )}
    </>
  )

  if (claimable) {
    return (
      <button type="button" onClick={onSelect} aria-pressed={selected} className={sharedTileClass}>
        {content}
      </button>
    )
  }

  return (
    <div
      aria-disabled="true"
      aria-label={
        cooldownLeft !== null
          ? `Daily bonus available in ${formatHms(cooldownLeft)}`
          : 'Daily bonus on cooldown'
      }
      className={sharedTileClass}
    >
      {content}
    </div>
  )
}

// Inbox-style tile for admin grants / affiliate payouts / promotions
// that require an explicit claim. Renders three states:
//   - loading
//   - empty (greyed lock icon, "All caught up")
//   - filled (gift icon, count badge, preview of the newest reward)
function PendingBonusTile({
  count,
  first,
  loading,
  selected,
  selectedAwardId,
  onSelect,
}: {
  count: number
  first: PendingBonus | null
  loading: boolean
  selected: boolean
  selectedAwardId: string | null
  onSelect: (awardId: string) => void
}) {
  const hasItems = count > 0 && first !== null
  const isSelected = hasItems && selected && selectedAwardId === first.awardId
  const sharedTileClass = cn(
    'group relative flex flex-col items-center gap-1.5 rounded-md border bg-[var(--cf-bg-elevated)] p-3 text-center transition-all duration-200',
    hasItems
      ? isSelected
        ? 'border-[var(--cf-gold-medium)] shadow-[inset_0_1px_0_rgba(255,245,200,0.10),0_0_20px_-4px_rgba(245,208,102,0.40)]'
        : 'border-[var(--cf-border-default)] hover:border-[var(--cf-gold-medium)]/60 cursor-pointer'
      : 'border-[var(--cf-border-default)] opacity-80',
  )

  const content = (
    <>
      {/* Count badge in the corner — only when there are multiple. */}
      {count > 1 && (
        <span className="absolute right-2 top-2 grid h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--cf-gold-light)] px-1.5 text-[10px] font-extrabold text-[#1a1300]">
          {count}
        </span>
      )}
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-full transition-colors',
          hasItems
            ? 'bg-[var(--cf-gold-deep)]/25 text-[var(--cf-gold-light)]'
            : 'bg-[var(--cf-bg-base)] text-[var(--cf-gray-light)]',
        )}
      >
        {hasItems ? <Gift className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
      </span>
      <div
        className={cn(
          'text-[11px] font-bold uppercase tracking-[0.12em]',
          hasItems ? 'text-white' : 'text-[var(--cf-gray-light)]',
        )}
      >
        Pending Bonus
      </div>
      {loading ? (
        <div className='text-[10px] tabular-nums text-[var(--cf-gray-light)] [font-feature-settings:"tnum"_1]'>
          Loading…
        </div>
      ) : hasItems ? (
        <div className="space-y-0.5">
          <div className='text-[11px] font-bold tabular-nums text-[var(--cf-gold-light)] [font-feature-settings:"tnum"_1]'>
            {first.gc !== '0' && <>{first.gc} GC </>}
            {first.sc !== '0' && (
              <span className="cf-sc-shine">
                {first.gc !== '0' ? '+ ' : ''}
                {first.sc} SC
              </span>
            )}
          </div>
          <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--cf-gray-light)]/80">
            {first.sourceLabel}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-[var(--cf-gray-light)]">All caught up</div>
      )}
    </>
  )

  if (hasItems) {
    return (
      <button
        type="button"
        onClick={() => onSelect(first.awardId)}
        aria-pressed={isSelected}
        className={sharedTileClass}
      >
        {content}
      </button>
    )
  }

  return (
    <div aria-disabled="true" className={sharedTileClass}>
      {content}
    </div>
  )
}
