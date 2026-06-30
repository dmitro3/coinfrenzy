'use client'

import Link from 'next/link'

import { VerifyIdentityButton } from '@coinfrenzy/ui/player'

interface KycRequiredCardProps {
  gameDisplayName: string
}

// Replaces the legacy inline "Verify identity" link with the new
// popup-based flow. The Footprint iframe opens in place — the player
// never leaves the game page. On success the shell's postMessage
// listener calls router.refresh() and the launch retries on its own.

export function KycRequiredCard({ gameDisplayName }: KycRequiredCardProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white">
        {gameDisplayName}
      </h1>
      <div className="mt-6 rounded-md border border-[var(--cf-gold-deep)] bg-[#231804] p-5 text-sm text-[var(--cf-gold-light)]">
        <p className="font-semibold">SC play requires Level 2 identity verification.</p>
        <p className="mt-1 text-[var(--cf-gray-light)]">
          We&apos;ll open a secure window from Footprint — most players finish in under two minutes.
          Your ID never leaves the vendor.
        </p>
        <div className="mt-4">
          <VerifyIdentityButton
            reason={`Required to play ${gameDisplayName} with Sweepstakes Coins`}
            label="Verify identity to play"
          />
        </div>
      </div>
      <Link
        href="/casino-games"
        className="mt-4 inline-block text-sm font-semibold text-[var(--cf-gold-light)] underline"
      >
        ← Back to games
      </Link>
    </div>
  )
}
