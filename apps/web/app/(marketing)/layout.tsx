import type { ReactNode } from 'react'

import { CfChromaKeyDef, BodyCfSurface } from '@coinfrenzy/ui/player'
import { MarketingHeader, MarketingFooter } from '@coinfrenzy/ui/marketing'

import { getPlayerSession } from '@/lib/player-session'

// Marketing surface — public pages. Coin Frenzy branded header + footer
// wrapping every public/legal page. We peek at the player session to
// swap the right-hand CTAs: logged-in visitors see "Go to Lobby"
// instead of "Log in / Sign up".

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const session = await getPlayerSession()
  return (
    <div className="dark min-h-screen bg-[var(--cf-bg-base)] text-white">
      <BodyCfSurface value="marketing" />
      <CfChromaKeyDef />
      <MarketingHeader authed={Boolean(session)} />
      <main className="min-h-[60vh]">{children}</main>
      <MarketingFooter />
    </div>
  )
}
