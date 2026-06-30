import Link from 'next/link'
import { ChevronLeft, Search } from 'lucide-react'

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

      <form className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cf-gray-light)]" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search"
            className="h-11 w-full rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] pl-10 pr-3 text-sm text-white placeholder:text-[var(--cf-gray-light)] focus:border-[var(--cf-gold-medium)] focus:outline-none"
          />
        </div>
        <select
          name="provider"
          defaultValue={provider}
          className="h-11 min-w-[180px] rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-sm text-white focus:border-[var(--cf-gold-medium)] focus:outline-none"
        >
          <option value="">All Providers</option>
          {providers.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.displayName}
            </option>
          ))}
        </select>
        {validSlug && <input type="hidden" name="category" value={validSlug} />}
        <button
          type="submit"
          className="cf-gold-gradient h-11 rounded-md px-5 text-sm font-bold uppercase tracking-wider text-[#1a1a1a]"
        >
          Apply
        </button>
      </form>

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
