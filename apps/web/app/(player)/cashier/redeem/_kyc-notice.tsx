'use client'

import { ShieldCheck } from 'lucide-react'

import { VerifyIdentityButton } from '@coinfrenzy/ui/player'

interface KycNoticeProps {
  kycVerified: boolean
  kycLevel: number
}

// Replaces the inline "Verify identity" link on the cashier redeem
// page with a button that opens the Footprint popup right where the
// player is. Server component imports this and passes the KYC state.

export function CashierKycNotice({ kycVerified, kycLevel }: KycNoticeProps) {
  return (
    <div className="mt-6 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-4 text-sm">
      <h2 className="flex items-center gap-2 font-bold text-white">
        <ShieldCheck className="h-4 w-4 text-[var(--cf-gold-light)]" /> Identity verification
      </h2>
      {kycVerified ? (
        <p className="mt-1 text-xs text-[var(--cf-green-bright)]">
          Verified (Level {kycLevel}) — you can redeem.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--cf-gray-light)]">
            Level 2 verification is required before SC can be redeemed — most players finish in
            under two minutes.
          </p>
          <VerifyIdentityButton
            reason="Required to redeem Sweepstakes Coins"
            label="Verify now"
            variant="pill"
          />
        </div>
      )}
    </div>
  )
}
