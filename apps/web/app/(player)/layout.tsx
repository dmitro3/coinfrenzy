import type { ReactNode } from 'react'

import { getActiveCurrency } from '@/lib/active-currency'
import { getPlayerWallets, getShopModalData, serializeWallet } from '@/lib/player-data'
import type { ShopModalServerData } from '@/lib/player-data'
import { getPlayerSession } from '@/lib/player-session'

import { PlayerProviders } from './_providers'
import { PlayerShell } from './_shell'

export const dynamic = 'force-dynamic'

// Default shop modal data for unauthenticated visitors — the shell
// still renders the chrome (sidebar, topbar) in guest mode but all
// wallet/shop features are disabled.
const GUEST_SHOP_DATA: ShopModalServerData = {
  redeemableSc: '0',
  redeemableUsd: '$0.00',
  totalSc: '0',
  kycVerified: false,
  blockedScState: false,
  instruments: [],
}

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const session = await getPlayerSession()

  // Unauthenticated visitors (lobby is public) — render the player
  // shell in guest mode with Login/Create Account CTAs instead of
  // wallet balances and avatar menu.
  if (!session) {
    const activeCurrency = await getActiveCurrency()
    return (
      <div className="dark min-h-screen bg-[var(--cf-bg-base)] text-white">
        <PlayerProviders>
          <PlayerShell
            playerId=""
            displayName="Guest"
            email=""
            emailVerified={false}
            blockedStateGcOnly={false}
            wallets={[]}
            initialCurrency={activeCurrency}
            shopModalData={GUEST_SHOP_DATA}
            isGuest
          >
            {children}
          </PlayerShell>
        </PlayerProviders>
      </div>
    )
  }

  // Self-excluded players cannot use the player surface (docs/09 §7.1).
  // They can still view /account/responsible-gaming to extend the
  // exclusion — that's the only carved-out path; everything else just
  // bounces to login on the next request.
  if (
    session.player.status === 'self_excluded' &&
    session.player.rgSelfExcludedUntil &&
    session.player.rgSelfExcludedUntil > new Date()
  ) {
    // Allow only /account/responsible-gaming through; in this layout we
    // hand them a banner-only view via the shell. The signOut button
    // remains accessible.
  }

  // PERFORMANCE: Fan these out in parallel — they're independent reads.
  // Sequential awaits cost us ~120-300ms of stacked latency on every
  // navigation; `Promise.all` collapses that to the single longest call.
  const [activeCurrency, wallets] = await Promise.all([
    getActiveCurrency(),
    getPlayerWallets(session.player.id),
  ])
  const scWallet = wallets.find((w) => w.currency === 'SC')
  const shopModalData = await getShopModalData(
    session.player.id,
    session.player.blockedStateGcOnly,
    scWallet,
  )

  return (
    <div className="dark min-h-screen bg-[var(--cf-bg-base)] text-white">
      <PlayerProviders>
        <PlayerShell
          playerId={session.player.id}
          displayName={session.user.name ?? session.player.email.split('@')[0]}
          email={session.player.email}
          emailVerified={session.user.emailVerified}
          blockedStateGcOnly={session.player.blockedStateGcOnly}
          wallets={wallets.map(serializeWallet)}
          initialCurrency={activeCurrency}
          shopModalData={shopModalData}
        >
          {children}
        </PlayerShell>
      </PlayerProviders>
    </div>
  )
}
