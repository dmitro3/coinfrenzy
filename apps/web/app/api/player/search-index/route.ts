import { NextResponse } from 'next/server'

import { loadGamesCatalog } from '@/lib/games-catalog'
import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Search-index endpoint used by the Spotlight (Cmd+K) overlay. Returns
// every game (active + customer-facing), every provider, and a
// hand-curated list of player-app destinations. We do NOT include any
// account-private values — this can be safely cached on the client for
// the session duration.

interface SearchEntry {
  id: string
  kind: 'game' | 'provider' | 'page'
  label: string
  description?: string
  href: string
  thumbnailUrl?: string | null
  category?: string
  keywords: string[]
}

const STATIC_PAGES: SearchEntry[] = [
  {
    id: 'page:lobby',
    kind: 'page',
    label: 'Lobby',
    description: 'Featured games + originals',
    href: '/lobby',
    keywords: ['lobby', 'home', 'casino', 'featured'],
  },
  {
    id: 'page:casino-games',
    kind: 'page',
    label: 'All games',
    description: 'Browse the full catalog',
    href: '/casino-games',
    keywords: ['games', 'catalog', 'all'],
  },
  {
    id: 'page:promotions',
    kind: 'page',
    label: 'Promotions',
    description: 'Active offers + daily bonus',
    href: '/promotions',
    keywords: ['promotions', 'promos', 'offers', 'deals'],
  },
  {
    id: 'page:bonuses',
    kind: 'page',
    label: 'My bonuses',
    description: 'Active + completed bonus awards',
    href: '/bonuses',
    keywords: ['bonuses', 'awards', 'rewards'],
  },
  {
    id: 'page:cashier-redeem',
    kind: 'page',
    label: 'Redeem SC',
    description: 'Cash out sweepstakes coins',
    href: '/cashier/redeem',
    keywords: ['redeem', 'cashout', 'withdraw', 'cash', 'sc'],
  },
  {
    id: 'page:shop',
    kind: 'page',
    label: 'Shop',
    description: 'Buy gold coins + sweeps',
    href: '/lobby?shop=1',
    keywords: ['shop', 'buy', 'purchase', 'gc', 'gold', 'coins'],
  },
  {
    id: 'page:favorites',
    kind: 'page',
    label: 'Favorites',
    description: 'Games you have starred',
    href: '/favorites',
    keywords: ['favorites', 'starred', 'saved'],
  },
  {
    id: 'page:recent-games',
    kind: 'page',
    label: 'Recently played',
    description: 'Pick up where you left off',
    href: '/recent-games',
    keywords: ['recent', 'history', 'played'],
  },
  {
    id: 'page:referrals',
    kind: 'page',
    label: 'Referrals',
    description: 'Invite friends + earn SC',
    href: '/referrals',
    keywords: ['referrals', 'invite', 'friends', 'share'],
  },
  {
    id: 'page:vip',
    kind: 'page',
    label: 'VIP',
    description: 'Loyalty perks + host contact',
    href: '/vip',
    keywords: ['vip', 'loyalty', 'host'],
  },
  {
    id: 'page:account',
    kind: 'page',
    label: 'Account',
    description: 'Profile + settings',
    href: '/account',
    keywords: ['account', 'profile', 'me'],
  },
  {
    id: 'page:account-notifications',
    kind: 'page',
    label: 'Notification settings',
    description: 'Email / SMS / push preferences',
    href: '/account/notifications',
    keywords: ['notifications', 'preferences', 'email', 'sms'],
  },
  {
    id: 'page:account-security',
    kind: 'page',
    label: 'Security',
    description: 'Password + two-factor + sessions',
    href: '/account/security',
    keywords: ['security', 'password', '2fa', 'login'],
  },
  {
    id: 'page:account-responsible-gaming',
    kind: 'page',
    label: 'Responsible gaming',
    description: 'Deposit / session limits + self-exclusion',
    href: '/account/responsible-gaming',
    keywords: ['responsible', 'gaming', 'limits', 'self', 'exclusion'],
  },
  {
    id: 'page:support',
    kind: 'page',
    label: 'Support',
    description: 'Help center + contact',
    href: '/support',
    keywords: ['support', 'help', 'contact'],
  },
]

export async function GET() {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const games = await loadGamesCatalog({})
  const gameEntries: SearchEntry[] = games.map((g) => ({
    id: `game:${g.slug}`,
    kind: 'game',
    label: g.displayName,
    description: g.providerDisplayName,
    href: `/casino-games/${g.slug}`,
    thumbnailUrl: g.thumbnailUrl,
    category: g.category,
    keywords: [g.displayName, g.providerDisplayName, g.category, g.providerSlug].filter(Boolean),
  }))

  // Provider entries — derive from the games list so we don't need a
  // second DB roundtrip. Each provider's href points at the catalog
  // filtered to that provider.
  const providerMap = new Map<string, SearchEntry>()
  for (const g of games) {
    if (!providerMap.has(g.providerSlug)) {
      providerMap.set(g.providerSlug, {
        id: `provider:${g.providerSlug}`,
        kind: 'provider',
        label: g.providerDisplayName,
        description: 'Game provider',
        href: `/casino-games?provider=${encodeURIComponent(g.providerSlug)}`,
        keywords: [g.providerDisplayName, g.providerSlug, 'provider', 'studio'],
      })
    }
  }

  const entries: SearchEntry[] = [...gameEntries, ...providerMap.values(), ...STATIC_PAGES]

  return NextResponse.json({ entries }, { headers: { 'cache-control': 'private, max-age=120' } })
}
