'use client'

import * as React from 'react'
import { ShieldCheck, X } from 'lucide-react'

import { cn } from '../lib/utils'
import { ErrorChip } from './ErrorChip'
import { useKycModal } from './KycModalContext'

// docs/07 §6 — branded popup that hosts the Footprint onboarding flow
// inline (no full-page navigation). Mirrors the `InlineFinixCheckout`
// pattern used by the Shop modal so the player experience is consistent
// across cashier checkout and KYC.
//
// Flow:
//   1. Modal opens → POST /api/player/kyc/start to get the Footprint
//      session URL (mock or real). Cached for the modal's lifetime.
//   2. The URL is rendered in an iframe with ?embedded=1 so the mock
//      vendor page renders clean chrome and posts outcome back via
//      postMessage instead of full-page navigation.
//   3. On `coinfrenzy:kyc-complete` we close the modal, fire the
//      caller's `onVerified` callback (if any), and post a
//      `coinfrenzy:kyc-updated` message up to the shell so the route
//      refreshes and the new KYC level lands on screen.
//   4. On `coinfrenzy:kyc-cancel` we close without firing the
//      callback.

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

export function KycModalRoot() {
  const { open, reason, close, consumeOnVerified } = useKycModal()
  const [state, setState] = React.useState<LoadState>({ kind: 'idle' })

  // Start a fresh onboarding session each time the modal opens. We
  // intentionally don't reuse a cached URL across opens — the
  // validation token is one-shot and the player may have changed state
  // (e.g. completed phone verification) between attempts.
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
          if (!cancelled) {
            setState({
              kind: 'error',
              message: 'Could not start verification right now. Please try again.',
            })
          }
          return
        }
        const data = (await res.json()) as Partial<KycStartPayload>
        if (cancelled) return
        if (!data.url) {
          setState({
            kind: 'error',
            message: 'Verification flow returned no URL. Contact support.',
          })
          return
        }
        setState({
          kind: 'ready',
          payload: {
            url: data.url,
            validationToken: data.validationToken ?? '',
            footprintUserId: data.footprintUserId ?? '',
            stubbed: data.stubbed ?? false,
          },
        })
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Network error — please try again.',
          })
        }
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

  // Listen for the iframe completion message. Footprint's hosted flow
  // and our mock vendor page both post these (mock today; real Footprint
  // when we add the JS SDK wrapper in §6.2).
  React.useEffect(() => {
    if (!open) return
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; outcome?: string } | null
      if (!data?.type) return
      if (data.type === 'coinfrenzy:kyc-complete') {
        if (data.outcome === 'pass') {
          const cb = consumeOnVerified()
          if (cb) {
            try {
              cb()
            } catch (err) {
              console.error('[kyc-modal] onVerified callback threw', err)
            }
          }
          // Notify the shell so it can router.refresh() and pull the
          // updated KYC level. Same channel pattern as the wallet-changed
          // signal used by the mock vendors.
          window.postMessage({ type: 'coinfrenzy:kyc-updated' }, window.location.origin)
        }
        close()
      } else if (data.type === 'coinfrenzy:kyc-cancel') {
        close()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [open, close, consumeOnVerified])

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
          'relative w-full max-w-xl overflow-hidden rounded-xl',
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

        <div className="px-5 pb-5 pt-4">
          <KycModalBody state={state} onRetry={() => setState({ kind: 'idle' })} />
        </div>
      </div>
    </div>
  )
}

function KycModalBody({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--cf-gray-light)]">
          Powered by Footprint. We securely collect your ID and a quick selfie — most players finish
          in under two minutes.
        </p>
        <div className="cf-skeleton-shimmer h-[500px] w-full rounded-md" />
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
    <section className="space-y-3">
      <p className="text-xs text-[var(--cf-gray-light)]">
        Powered by Footprint. We securely collect your ID and a quick selfie — most players finish
        in under two minutes.
      </p>
      <KycIframe url={state.payload.url} />
      <p className="text-center text-[10px] text-[var(--cf-gray-light)]">
        Your documents are encrypted end-to-end. CoinFrenzy never stores the raw images.
      </p>
    </section>
  )
}

function KycIframe({ url }: { url: string }) {
  // Inject ?embedded=1 + theme=dark so the mock vendor page renders
  // flush against the modal (no full-page chrome) and posts outcome
  // back via postMessage instead of full-page navigation. The flags
  // are no-ops on the real Footprint hosted URL.
  const iframeUrl = React.useMemo(() => {
    try {
      const u = new URL(url, window.location.origin)
      u.searchParams.set('embedded', '1')
      u.searchParams.set('theme', 'dark')
      return u.toString()
    } catch {
      return url
    }
  }, [url])

  return (
    <div className="overflow-hidden rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-base)]">
      <iframe
        src={iframeUrl}
        title="Identity verification"
        className="h-[500px] w-full"
        allow="camera; microphone"
      />
    </div>
  )
}
