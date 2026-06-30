'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

import {
  GoldButton,
  PromoBanner,
  SuccessCelebration,
  useRewardsModal,
  useToast,
} from '@coinfrenzy/ui/player'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 + M5 — Promotions page. A featured hero banner sits on
// top and the secondary offers stack underneath in a 2-up grid on
// tablet+. Each banner uses the elevated `PromoBanner` frame (gold
// border, corner gleams, hover sweep, badge pill, glass CTA pill).
//
// Bonus codes are redeemed via the promo code engine (docs/06 §8); the
// rest of the page is content-driven from the CRM (docs/11) once
// campaign banners are stored there.
//
// Item 7 of the UX polish audit — the daily-bonus banner used to point
// at `/promotions/daily-bonus`, which is a dead 404. We repoint it to
// `?openRewards=1`, and this page detects that param and pulls open the
// Available Rewards popover so the player can claim in-place.
//
// Note: `refer-friends-desktop.png` currently ships with a duplicated/
// typo'd ("EARN CINS") bake, so we render that promo via programmatic
// mode until a clean image lands — same elevated frame, gold display
// headline drawn from typography instead of art.
const HERO_BANNER = {
  title: 'Get 30 SC for just $10',
  subtitle: 'More wins. First-purchase only. Claim now.',
  imageSrc: '/brand/banners/new-offer-30sc.png',
  alt: 'Get 30 SC for just $10 — more wins, first-purchase only',
  href: '/lobby?shop=1',
  badge: { label: 'Featured', tone: 'hot' as const },
  cta: { label: 'Claim 30 SC' },
} as const

const SECONDARY_BANNERS = [
  {
    title: 'Free Daily Bonus',
    subtitle: 'Claim 1 Free SC + 10,000 GC Every Day',
    imageSrc: '/brand/banners/daily-bonus.png',
    alt: 'Free Daily Bonus — claim 1 free SC and 10,000 GC every day',
    href: '/promotions?openRewards=1',
    badge: { label: 'Daily', tone: 'daily' as const },
    cta: { label: 'Claim bonus' },
  },
  {
    // No imageSrc → programmatic mode. The shipped bake of this banner
    // had visible artifacting; we render the typography in-app so the
    // page stays high quality until a fresh image lands.
    title: 'Refer Friends. Earn Coins.',
    titleLines: ['Refer Friends.', 'Earn Coins.'],
    subtitle: 'Earn bonus coins every time a friend plays.',
    alt: 'Refer Friends. Earn Coins. Bonus coins when friends play',
    href: '/referrals',
    badge: { label: 'New', tone: 'new' as const },
    cta: { label: 'Refer now' },
    accent: 'royal' as const,
  },
] as const

interface PromoCelebration {
  gc: number
  sc: number
  code: string
}

function parseAwardToNumber(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/,/g, '').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export default function PromotionsPage() {
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [celebration, setCelebration] = React.useState<PromoCelebration | null>(null)
  const toast = useToast()
  const rewardsModal = useRewardsModal()
  const searchParams = useSearchParams()

  // ?openRewards=1 deep-link from the Daily Bonus banner (and any
  // future "go claim" CTA). We strip the param after opening so a
  // refresh doesn't keep re-popping the popover.
  React.useEffect(() => {
    if (searchParams?.get('openRewards') !== '1') return
    rewardsModal.requestOpen()
    const next = new URLSearchParams(searchParams.toString())
    next.delete('openRewards')
    const url = next.toString() ? `?${next.toString()}` : '/promotions'
    window.history.replaceState({}, '', url)
  }, [searchParams, rewardsModal])

  async function redeem(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const res = await fetch('/api/player/promo/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: trimmed.toUpperCase() }),
      })
      const body = (await res.json().catch(() => null)) as {
        message?: string
        gc?: string
        sc?: string
        awardStatus?: string
      } | null
      if (!res.ok) {
        toast.error(body?.message ?? 'That code is not valid.', { title: 'Code rejected' })
        return
      }
      setCode('')
      toast.success(`Code "${trimmed.toUpperCase()}" applied.`, {
        title: 'Bonus successfully claimed',
      })
      setCelebration({
        gc: parseAwardToNumber(body?.gc),
        sc: parseAwardToNumber(body?.sc),
        code: trimmed.toUpperCase(),
      })
    } catch {
      toast.error('Connection problem — please try again.', {
        title: 'Could not apply code',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-4">
      {/* Page header — bigger, with the gold rule + helper subtitle so
          the page identifies itself before the offer cards take over. */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--cf-border-subtle)] pb-3">
        <div>
          <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white sm:text-3xl">
            Promotions
          </h1>
          <p className="mt-1 text-xs text-[var(--cf-gray-light)] sm:text-sm">
            Current offers, daily bonuses, and bonus codes — claim in one tap.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--cf-gold-deep)]/45 bg-[#1a1305] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--cf-gold-light)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--cf-gold-light)]" />
          Live offers
        </span>
      </header>

      {celebration ? (
        <div className="mt-4 overflow-hidden rounded-md border border-[var(--cf-gold-deep)]/45 bg-[var(--cf-bg-card)]">
          <SuccessCelebration
            variant="promo"
            headline="Code redeemed"
            sub={`Code "${celebration.code}" landed in your wallet.`}
            gcAmount={celebration.gc}
            scAmount={celebration.sc}
            onComplete={() => setCelebration(null)}
          />
        </div>
      ) : null}

      {/* Bonus-code input — gold-rimmed, kept compact above the offer
          cards so it doesn't compete visually with the banners. */}
      <form
        onSubmit={redeem}
        className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-3"
      >
        <label htmlFor="promo-code" className="sr-only">
          Bonus code
        </label>
        <input
          id="promo-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter Bonus Code"
          className="h-10 flex-1 min-w-[200px] rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-sm uppercase tracking-wider text-white placeholder:text-[var(--cf-gray-light)] focus:border-[var(--cf-gold-medium)] focus:outline-none"
        />
        <GoldButton type="submit" disabled={busy} size="md">
          {busy ? 'Claiming…' : 'Claim'}
        </GoldButton>
      </form>

      {/* Hero offer — taller frame, "FEATURED" hot pill in the corner,
          plus a glass "Claim 30 SC" CTA over the bottom-right of the
          baked yacht-skyline art. */}
      <div className="mt-6">
        <PromoBanner {...HERO_BANNER} size="hero" />
      </div>

      {/* Secondary offers — 2-up grid on tablet+, stacked on phone.
          Each gets its own badge tone (daily / new) and CTA copy so
          the row reads as a curated set of distinct offers rather
          than three repeats of the same banner. */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        {SECONDARY_BANNERS.map((b) => (
          <PromoBanner key={b.title} {...b} />
        ))}
      </div>
    </div>
  )
}
