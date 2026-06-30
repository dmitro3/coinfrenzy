'use client'

import * as React from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

// docs/07 §6 — KYC popup callback page.
//
// Footprint redirects the popup window here after the user completes (or
// cancels) the hosted verification flow. The page:
//   1. Reads the ?status query param Footprint appends.
//   2. Posts a coinfrenzy:kyc-complete / coinfrenzy:kyc-cancel message to
//      window.opener (the main application window).
//   3. Calls window.close() to dismiss the popup.
//
// If window.opener is absent (e.g. user bookmarked the URL directly), we
// fall back to a simple redirect to /account/kyc instead of closing.

export default function KycCallbackPage() {
  const [status, setStatus] = React.useState<'closing' | 'redirecting'>('closing')

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('status') === 'fail' ? 'fail' : 'pass'

    if (window.opener && !window.opener.closed) {
      try {
        const message =
          outcome === 'pass'
            ? { type: 'coinfrenzy:kyc-complete', outcome: 'pass' }
            : { type: 'coinfrenzy:kyc-cancel' }
        window.opener.postMessage(message, window.location.origin)
      } catch {
        // opener may be cross-origin — ignore
      }
      window.close()
    } else {
      // No opener: redirect to the KYC account page as a fallback.
      setStatus('redirecting')
      window.location.replace('/account/kyc?status=completed')
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--cf-bg-base)] p-8 text-white">
      {status === 'closing' ? (
        <>
          <CheckCircle2 className="h-12 w-12 text-[var(--cf-green-bright)]" />
          <p className="text-base font-semibold">Verification complete — closing window…</p>
        </>
      ) : (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-[var(--cf-gold-light)]" />
          <p className="text-sm text-[var(--cf-gray-light)]">Redirecting…</p>
        </>
      )}
    </div>
  )
}
