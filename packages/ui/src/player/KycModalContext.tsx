'use client'

import * as React from 'react'

// docs/07 §6 — global KYC verification modal trigger. Any descendant
// component (game launch screen, cashier redeem page, shop modal redeem
// panel, account/kyc page, future verification gates) can open the
// branded popup via `useKycModal().openKyc({ reason })`.
//
// The actual modal renders once at the shell root via `<KycModalRoot />`
// so opening from anywhere shows the same instance and keeps the iframe
// state in one place.

export interface OpenKycOptions {
  /**
   * One-line reason shown in the modal header so the player understands
   * why the verification flow popped — "SC play requires identity
   * verification", "Redemption requires identity verification", etc.
   */
  reason?: string
  /** Optional callback fired once the player completes (status === pass). */
  onVerified?: () => void
}

interface KycModalContextValue {
  open: boolean
  reason: string | null
  openKyc: (options?: OpenKycOptions) => void
  close: () => void
  /** Internal — used by the root to drain the queued onVerified callback. */
  consumeOnVerified: () => (() => void) | null
}

const KycModalContext = React.createContext<KycModalContextValue | null>(null)

export function KycModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState<string | null>(null)
  const verifiedCbRef = React.useRef<(() => void) | null>(null)

  const openKyc = React.useCallback((options: OpenKycOptions = {}) => {
    setReason(options.reason ?? null)
    verifiedCbRef.current = options.onVerified ?? null
    setOpen(true)
  }, [])

  const close = React.useCallback(() => {
    setOpen(false)
  }, [])

  const consumeOnVerified = React.useCallback(() => {
    const cb = verifiedCbRef.current
    verifiedCbRef.current = null
    return cb
  }, [])

  const value = React.useMemo<KycModalContextValue>(
    () => ({ open, reason, openKyc, close, consumeOnVerified }),
    [open, reason, openKyc, close, consumeOnVerified],
  )

  return <KycModalContext.Provider value={value}>{children}</KycModalContext.Provider>
}

export function useKycModal(): KycModalContextValue {
  const ctx = React.useContext(KycModalContext)
  if (!ctx) {
    // Outside the provider (e.g. marketing surfaces) we degrade to a
    // full-page redirect so the link still works.
    return {
      open: false,
      reason: null,
      openKyc: () => {
        if (typeof window !== 'undefined') window.location.href = '/account/kyc'
      },
      close: () => undefined,
      consumeOnVerified: () => null,
    }
  }
  return ctx
}
