'use client'

import * as React from 'react'
import { ShieldCheck } from 'lucide-react'

import { cn } from '../lib/utils'
import { useKycModal } from './KycModalContext'

// Small client-side trigger used everywhere a verification gate appears.
// Wraps the global KYC modal so call sites stay declarative: drop in
// `<VerifyIdentityButton reason="SC play requires identity verification" />`.

interface VerifyIdentityButtonProps {
  /** Shown in the modal header so the player knows why it popped. */
  reason?: string
  /** Optional callback fired once the player completes (pass). */
  onVerified?: () => void
  /** Override the default label ("Verify identity"). */
  label?: string
  /** Render as the compact pill or the full-width gold CTA. */
  variant?: 'pill' | 'cta'
  className?: string
}

export function VerifyIdentityButton({
  reason,
  onVerified,
  label = 'Verify identity',
  variant = 'cta',
  className,
}: VerifyIdentityButtonProps) {
  const { openKyc } = useKycModal()
  const onClick = React.useCallback(() => {
    openKyc({ reason, onVerified })
  }, [openKyc, reason, onVerified])

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm border border-[var(--cf-gold-medium)]/55 bg-[var(--cf-bg-base)] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--cf-gold-light)] hover:bg-[var(--cf-bg-card-hover)]',
          className,
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cf-gold-gradient inline-flex h-11 items-center justify-center gap-2 rounded-sm px-5 text-sm font-bold uppercase tracking-wider text-[#1a1a1a] transition-transform hover:translate-y-[-1px]',
        className,
      )}
    >
      <ShieldCheck className="h-4 w-4" />
      {label}
    </button>
  )
}
