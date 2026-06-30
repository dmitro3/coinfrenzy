import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Suspense } from 'react'

import {
  CategoryTabs,
  EmptyState,
  GameGrid,
  PLAYER_CATEGORIES,
  type GameTileData,
  type PlayerCategorySlug,
} from '@coinfrenzy/ui/player'

import { getActiveCurrency } from '@/lib/active-currency'
import { loadGamesCatalog } from '@/lib/games-catalog'
import { countsByPlayerCategory, groupByPlayerCategory } from '@/lib/player-categories'

import { CasinoGamesSearchForm } from './_search-form'

export const dynamic = 'force-dynamic'

interface SearchParams {
  category?: string
  q?: string
  provider?: string
}

// docs/10 §4.2 + M5 — full game catalog page. URL pattern is
// /casino-games?category=<slug>. Without a category the full list
// renders. Matches the live site's slots / live-dealers / etc. screens.

export default async function CasinoGamesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const requested = (params.category as PlayerCategorySlug) || null
  const validSlug = PLAYER_CATEGORIES.find((c) => c.slug === requested)?.slug ?? null
  const search = params.q?.trim().toLowerCase() ?? ''
  const provider = params.provider?.trim().toLowerCase() ?? ''

  const currency = await getActiveCurrency()
  const allGames = await loadGamesCatalog({ currency })
  const counts = countsByPlayerCategory(allGames)
  const grouped = groupByPlayerCategory(allGames)

  let games = validSlug ? grouped[validSlug] : allGames
  if (search) {
    games = games.filter(
      (g) =>
        g.displayName.toLowerCase().includes(search) ||
        g.providerDisplayName.toLowerCase().includes(search),
    )
  }
  if (provider) {
    games = games.filter((g) => g.providerSlug === provider)
  }

  // Distinct providers for the dropdown.
  const providers = Array.from(
    new Map(allGames.map((g) => [g.providerSlug, g.providerDisplayName])).entries(),
  ).map(([slug, displayName]) => ({ slug, displayName }))

  const tiles: GameTileData[] = games.map((g) => ({
    id: g.id,
    slug: g.slug,
    displayName: g.displayName,
    thumbnailUrl: g.thumbnailUrl,
    providerName: g.providerDisplayName,
    badge: g.isNew ? 'NEW' : null,
  }))

  const heading = PLAYER_CATEGORIES.find((c) => c.slug === validSlug)?.label ?? 'All Games'

  return (
    <div className="py-4">
      <Link
        href="/lobby"
        className="inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ChevronLeft className="h-4 w-4" /> {heading}
      </Link>

      <Suspense fallback={null}>
        <CasinoGamesSearchForm
          defaultQuery={search}
          defaultProvider={provider}
          categorySlug={validSlug}
          providers={providers}
        />
      </Suspense>

      <div className="mt-4">
        <CategoryTabs counts={counts} activeSlug={validSlug ?? undefined} />
      </div>

      <div className="mt-6">
        {tiles.length === 0 ? (
          <EmptyState
            headline="Nothing matches"
            sub={
              search || provider
                ? 'Try a different keyword, switch the provider filter, or clear your filters.'
                : 'No games are tagged with this category yet. Try another tab.'
            }
            action={{ label: 'See all games', href: '/casino-games' }}
          />
        ) : (
          <GameGrid games={tiles} currency={currency} />
        )}
      </div>
    </div>
  )
}
