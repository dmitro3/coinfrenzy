'use client'

import * as React from 'react'

// docs/07 §6 — popup close handler for the /account/kyc page.
//
// When Footprint redirects the popup to /account/kyc?status=completed (legacy
// playbook config), this component detects window.opener, fires the
// coinfrenzy:kyc-complete postMessage to the parent window, and closes the
// popup. This bridges the old playbook redirect URL to the new callback
// protocol without requiring a dashboard config change.
//
// Once the playbook redirect URL is updated to /account/kyc/callback this
// component becomes a no-op (window.opener will be absent).

export function KycPopupHandler({ status }: { status?: string }) {
  React.useEffect(() => {
    if (status !== 'completed') return
    if (typeof window === 'undefined') return
    if (!window.opener || window.opener.closed) return

    try {
      window.opener.postMessage(
        { type: 'coinfrenzy:kyc-complete', outcome: 'pass' },
        window.location.origin,
      )
    } catch {
      // cross-origin opener — ignore
    }
    window.close()
  }, [status])

  return null
}
