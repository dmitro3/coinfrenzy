'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { ErrorChip } from './ErrorChip'
import { useKycModal } from './KycModalContext'
import '@onefootprint/footprint-js/dist/footprint-js.css'

// docs/07 §6 — branded dialog that hosts the Footprint onboarding flow
// inline inside our own modal shell (no full-window takeover).
//
// SDK: @onefootprint/footprint-js v5.4.2 — initializeInline() embeds the
// Footprint iframe into a DOM container we own, keeping it confined to the
// modal dialog rather than overlaying the whole page.
//
// Flow:
//   1. Modal opens → POST /api/player/kyc/start → get session token.
//      Backend upserts kyc_status, preserving footprintUserId so the
//      Footprint session resumes from the player's previous progress.
//   2. Our branded shell renders; Footprint iframe auto-starts inline.
//   3. onComplete(validationToken) → POST /api/player/kyc/complete to
//      exchange the token server-side and update players.kycLevel.
//   4. API returns level >= 2 → verified state → broadcast
//      coinfrenzy:kyc-updated so route layout calls router.refresh().
//   5. API returns terminal=false (async review pending) → pending state.
//   6. API returns fail or HTTP error → failed/error state with retry.
//   7. onCancel / onClose → close modal without callback.
//
// Mock mode: stubbed=true → URL points at /mock-vendors/footprint,
// which cannot use the SDK so we fall back to a popup window.

const INLINE_CONTAINER_ID = 'cf-footprint-inline-container'

interface KycStartPayload {
  url: string
  validationToken: string
  footprintUserId: string
  stubbed: boolean
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; payload: KycStartPayload }
  | { kind: 'error'; message: string }
  | { kind: 'completing' }
  | { kind: 'verified' }
  | { kind: 'pending' }
  | { kind: 'failed'; message: string }

export function KycModalRoot() {
  const { open, reason, close, consumeOnVerified } = useKycModal()
  const [state, setState] = React.useState<LoadState>({ kind: 'idle' })

  const handleVerified = React.useCallback(() => {
    setState({ kind: 'verified' })
    const cb = consumeOnVerified()
    if (cb) {
      try {
        cb()
      } catch (e) {
        console.error('[kyc-modal] onVerified callback threw', e)
      }
    }
    window.postMessage({ type: 'coinfrenzy:kyc-updated' }, window.location.origin)
    setTimeout(close, 2000)
  }, [consumeOnVerified, close])

  // Start / resume an onboarding session each time the modal opens.
  // Backend preserves footprintUserId so Footprint auto-resumes progress.
  React.useEffect(() => {
    if (!open) {
      setState({ kind: 'idle' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void (async () => {
      try {
        const res = await fetch('/api/player/kyc/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        })
        if (!res.ok) {
          if (!cancelled)
            setState({
              kind: 'error',
              message: 'Could not start verification right now. Please try again.',
            })
          return
        }
        const data = (await res.json()) as Partial<KycStartPayload>
        if (cancelled) return
        if (!data.validationToken && !data.url) {
          setState({
            kind: 'error',
            message: 'Verification flow returned no session token. Contact support.',
          })
          return
        }
        setState({
          kind: 'ready',
          payload: {
            url: data.url ?? '',
            validationToken: data.validationToken ?? '',
            footprintUserId: data.footprintUserId ?? '',
            stubbed: data.stubbed ?? false,
          },
        })
      } catch (err) {
        if (!cancelled)
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Network error — please try again.',
          })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // Lock body scroll + Esc-to-close while the modal is open.
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  // Listen for postMessage from the mock-vendor popup path.
  React.useEffect(() => {
    if (!open) return
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; outcome?: string } | null
      if (!data?.type) return
      if (data.type === 'coinfrenzy:kyc-complete') {
        if (data.outcome === 'pass') handleVerified()
        else if (data.outcome === 'pending') setState({ kind: 'pending' })
        else if (data.outcome === 'fail')
          setState({
            kind: 'failed',
            message:
              'Identity verification was unsuccessful. Contact support if you believe this is an error.',
          })
        else close()
      } else if (data.type === 'coinfrenzy:kyc-cancel') {
        close()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [open, close, handleVerified])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Identity verification"
      data-no-coin-pop="true"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
    >
      <button
        type="button"
        aria-label="Close verification"
        onClick={close}
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      <div
        className={cn(
          'relative flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl',
          'border border-[var(--cf-gold-deep)]/40 bg-[var(--cf-bg-card)]',
          'shadow-[0_30px_70px_rgba(0,0,0,0.8)]',
        )}
      >
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[var(--cf-gold-light)] to-transparent" />

        <header className="relative overflow-hidden border-b border-[var(--cf-border-subtle)] bg-gradient-to-b from-[#1a1305] to-[var(--cf-bg-card)] px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--cf-gold-light)]" />
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold tracking-wide text-white">
                  Verify your identity
                </h2>
                {reason ? (
                  <p className="truncate text-[11px] text-[var(--cf-gray-light)]">{reason}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto',
            state.kind === 'ready' ? 'p-0' : 'px-5 pb-5 pt-4',
          )}
        >
          <KycModalBody
            state={state}
            onRetry={() => setState({ kind: 'idle' })}
            onClose={close}
            onVerified={handleVerified}
            onPending={() => setState({ kind: 'pending' })}
            onFailed={(msg) => setState({ kind: 'failed', message: msg })}
          />
        </div>
      </div>
    </div>
  )
}

function KycModalBody({
  state,
  onRetry,
  onClose,
  onVerified,
  onPending,
  onFailed,
}: {
  state: LoadState
  onRetry: () => void
  onClose: () => void
  onVerified: () => void
  onPending: () => void
  onFailed: (msg: string) => void
}) {
  if (state.kind === 'verified') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-[var(--cf-green-bright)]" />
        <p className="text-sm font-semibold text-white">Identity verified successfully</p>
        <p className="text-xs text-[var(--cf-gray-light)]">
          You can now play and redeem Sweeps Coins.
        </p>
      </div>
    )
  }

  if (state.kind === 'pending') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Clock className="h-10 w-10 text-[var(--cf-gold-light)]" />
        <p className="text-sm font-semibold text-white">Verification under review</p>
        <p className="text-xs text-[var(--cf-gray-light)]">
          Your submission is being reviewed. This usually takes a few minutes. We&apos;ll notify you
          when it&apos;s complete — you can close this window.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 text-xs font-semibold text-[var(--cf-gold-light)] underline"
        >
          Close
        </button>
      </div>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-red-800/60 bg-red-950/20 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-sm font-semibold text-white">Verification unsuccessful</p>
        <p className="text-xs text-[var(--cf-gray-light)]">{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-xs font-semibold text-[var(--cf-gold-light)] underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (state.kind === 'completing') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="cf-skeleton-shimmer h-8 w-8 rounded-full" />
        <p className="text-sm text-[var(--cf-gray-light)]">Finalizing verification…</p>
      </div>
    )
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--cf-gray-light)]">
          Powered by Footprint. We securely collect your ID and a quick selfie — most players finish
          in under two minutes.
        </p>
        <div className="cf-skeleton-shimmer h-[120px] w-full rounded-md" />
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-6 text-center">
        <p className="text-sm text-[var(--cf-gray-light)]">{state.message}</p>
        <ErrorChip message="Couldn't start verification" retryLabel="Retry" onRetry={onRetry} />
      </div>
    )
  }

  return (
    <KycLauncher
      payload={state.payload}
      onClose={onClose}
      onVerified={onVerified}
      onPending={onPending}
      onFailed={onFailed}
    />
  )
}

function KycLauncher({
  payload,
  onClose,
  onVerified,
  onPending,
  onFailed,
}: {
  payload: KycStartPayload
  onClose: () => void
  onVerified: () => void
  onPending: () => void
  onFailed: (msg: string) => void
}) {
  const [sdkReady, setSdkReady] = React.useState(false)
  const destroyRef = React.useRef<(() => void) | null>(null)
  const completingRef = React.useRef(false)

  // Exchange the Footprint validationToken with our backend to record
  // the verified status server-side before updating UI state.
  const handleComplete = React.useCallback(
    async (validationToken: string) => {
      if (completingRef.current) return
      completingRef.current = true
      try {
        const res = await fetch('/api/player/kyc/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ validationToken }),
        })
        const data = (await res.json()) as {
          level?: number
          terminal?: boolean
          status?: string
          error?: string
        }
        if (!res.ok) {
          onFailed(
            data.error === 'KYC_RECORD_NOT_FOUND'
              ? 'Verification record not found. Please try again.'
              : 'Could not finalise verification. Please try again or contact support.',
          )
          return
        }
        if ((data.level ?? 0) >= 2) {
          window.postMessage({ type: 'coinfrenzy:kyc-updated' }, window.location.origin)
          onVerified()
        } else if (data.terminal === false) {
          onPending()
        } else {
          onFailed(
            'Identity verification was unsuccessful. Contact support if you believe this is an error.',
          )
        }
      } catch {
        onFailed('Network error while finalising verification. Please try again.')
      } finally {
        completingRef.current = false
      }
    },
    [onVerified, onPending, onFailed],
  )

  const handleCancel = React.useCallback(() => {
    onClose()
  }, [onClose])

  const handleSdkClose = React.useCallback(() => {
    // User dismissed Footprint's UI — leave our modal open so they can retry.
  }, [])

  // Cleanup inline SDK on unmount.
  React.useEffect(() => {
    return () => {
      destroyRef.current?.()
    }
  }, [])

  // Real path: use initializeInline so the Footprint flow renders inside
  // our modal container instead of overlaying the whole page.
  React.useEffect(() => {
    if (payload.stubbed) return
    let cancelled = false

    void (async () => {
      try {
        const { onboarding } = await import('@onefootprint/footprint-js')
        if (cancelled) return
        const handle = await onboarding.initializeInline({
          onboardingSessionToken: payload.validationToken,
          containerId: INLINE_CONTAINER_ID,
          appearance: {
            theme: 'dark',
            variables: {
              containerBg: '#0d0b07',
              colorAccent: '#d4a017',
              borderRadius: '8px',
            },
          },
          onComplete: (token: string) => {
            void handleComplete(token)
          },
          onCancel: handleCancel,
          onClose: handleSdkClose,
          onError: (error: string) => {
            console.error('[kyc-sdk] error', error)
            onFailed('An unexpected error occurred during verification. Please try again.')
          },
        })
        if (cancelled) {
          handle.destroy()
          return
        }
        destroyRef.current = handle.destroy
        setSdkReady(true)
      } catch (err) {
        console.error('[kyc-sdk] failed to initialize inline', err)
        if (!cancelled)
          onFailed('Could not load the verification flow. Please refresh and try again.')
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.validationToken, payload.stubbed])

  // Mock path: open stub URL in a popup window — mock vendor posts
  // coinfrenzy:kyc-complete via postMessage (handled by the root).
  const launchMock = React.useCallback(() => {
    try {
      const u = new URL(payload.url, window.location.origin)
      u.searchParams.set('embedded', '1')
      u.searchParams.set('theme', 'dark')
      window.open(u.toString(), 'kycMockPopup', 'width=520,height=700,left=200,top=100')
    } catch {
      window.open(payload.url, 'kycMockPopup', 'width=520,height=700,left=200,top=100')
    }
  }, [payload.url])

  if (payload.stubbed) {
    return (
      <section className="space-y-4">
        <p className="text-xs text-[var(--cf-gray-light)]">
          Powered by Footprint. We securely collect your ID and a quick selfie — most players finish
          in under two minutes.
        </p>
        <button
          type="button"
          onClick={launchMock}
          className={cn(
            'w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all',
            'bg-[var(--cf-gold-light)] text-black hover:brightness-110',
          )}
        >
          Start Verification (mock)
        </button>
        <p className="text-center text-[10px] text-[var(--cf-gray-light)]">
          Your documents are encrypted end-to-end. CoinFrenzy never stores the raw images.
        </p>
      </section>
    )
  }

  return (
    <section>
      {!sdkReady && (
        <div className="space-y-2 px-5 pb-4 pt-4">
          <p className="text-xs text-[var(--cf-gray-light)]">
            Powered by Footprint. We securely collect your ID and a quick selfie — most players
            finish in under two minutes.
          </p>
          <div className="cf-skeleton-shimmer h-[580px] w-full rounded-md" />
        </div>
      )}
      {/* Footprint renders its iframe into this container via initializeInline.
          No horizontal padding here — the iframe fills the full card width and
          the dark containerBg passed via appearance blends with our modal bg. */}
      <div
        id={INLINE_CONTAINER_ID}
        className={cn('w-full rounded-b-xl', sdkReady ? 'min-h-[580px]' : 'h-0')}
      />
      {sdkReady && (
        <p className="px-5 pb-3 pt-2 text-center text-[10px] text-[var(--cf-gray-light)]">
          Your documents are encrypted end-to-end. CoinFrenzy never stores the raw images.
        </p>
      )}
    </section>
  )
}
