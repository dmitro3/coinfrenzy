'use client'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { useKycModal } from '@coinfrenzy/ui/player'

// docs/07 §6.2 — the canonical entry point lives on /account/kyc, but
// the actual flow is now the same popup used everywhere else on the
// site. Triggering it from the account page just opens the shared
// modal so the player gets identical chrome and the URL doesn't change
// while the Footprint iframe is loading.

export function StartKycButton({ email: _email }: { email: string }) {
  const { openKyc } = useKycModal()

  return (
    <Button onClick={() => openKyc({ reason: 'Identity verification' })}>Start verification</Button>
  )
}
