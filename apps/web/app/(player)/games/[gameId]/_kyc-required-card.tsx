'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { VerifyIdentityButton } from '@coinfrenzy/ui/player'

interface KycRequiredCardProps {
  gameDisplayName: string
}

// Shown when launchGame returns kyc_required.
// On KYC completion the onVerified callback triggers router.refresh() so
// the server component re-runs launchGame — if kycLevel >= 2 is now set,
// the game launches without the player navigating away.

export function KycRequiredCard({ gameDisplayName }: KycRequiredCardProps) {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white">
        {gameDisplayName}
      </h1>
      <div className="mt-6 rounded-md border border-[var(--cf-gold-deep)] bg-[#231804] p-5 text-sm text-[var(--cf-gold-light)]">
        <p className="font-semibold">Identity verification required to play.</p>
        <p className="mt-1 text-[var(--cf-gray-light)]">
          We&apos;ll open a secure Footprint window inside this page — most players finish in under
          two minutes. Your ID never leaves the vendor.
        </p>
        <div className="mt-4">
          <VerifyIdentityButton
            reason={`Required to play ${gameDisplayName}`}
            label="Verify identity to play"
            onVerified={() => router.refresh()}
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
