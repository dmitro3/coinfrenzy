'use client'

import * as React from 'react'

import { EmptyState } from '@coinfrenzy/ui/player'

// docs/ux-polish-audit.md — Item 5.
// Player-segment error boundary. Catches any uncaught error in a player
// route (server or client) and renders a designed recovery panel
// instead of Next.js's default error overlay. The fox-illustration
// EmptyState keeps the brand voice intact even when something has
// genuinely broken.

interface ErrorBoundaryProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PlayerSegmentError({ error, reset }: ErrorBoundaryProps) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    // Log to console so devs in DevTools still see the underlying
    // stack; in production the digest is what hits Sentry.
    // eslint-disable-next-line no-console
    console.error('[player] segment error', error)
  }, [error])

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <EmptyState
        headline="Something tripped"
        sub={
          error.digest
            ? `We hit an unexpected snag (ref ${error.digest}). Refresh to try again.`
            : 'We hit an unexpected snag. Refresh to try again.'
        }
        action={{ label: 'Try again', onClick: () => reset() }}
      />
    </div>
  )
}
