import { env } from '@coinfrenzy/config'
import {
  CategoryTabs,
  GameRail,
  LobbyHero,
  type GameTileData,
  type PlayerCategorySlug,
} from '@coinfrenzy/ui/player'

import { getActiveCurrency } from '@/lib/active-currency'
import { loadDbLobbySections, loadGamesCatalog, type CatalogGame } from '@/lib/games-catalog'
import { countsByPlayerCategory, groupByPlayerCategory } from '@/lib/player-categories'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 + docs/08 §4.3 — Coin Frenzy lobby. Sections + per-section
// ordering come from `casino_sub_categories` / `casino_sub_category_games`
// (the same tables the admin Game Lobby WYSIWYG editor writes to) when
// USE_DB_LOBBY_LAYOUT is on. Falls back to the legacy hardcoded category
// mapping in `lib/player-categories.ts` when the DB returns no sections,
// so a fresh DB still renders something useful before migration 0012.

// Each lobby rail is a single-line horizontal scroller (see GameRail).
// 15 tiles gives the arrows real estate to scroll through on wide
// screens while staying snappy to render. Anything more should live
// behind the "See All" link to the category page.
const RAIL_LIMIT = 15

export default async function LobbyPage() {
  const currency = await getActiveCurrency()
  const useDbLayout = env().USE_DB_LOBBY_LAYOUT

  if (useDbLayout) {
    const sections = await loadDbLobbySections({ currency })
    const totalGames = sections.reduce((acc, s) => acc + s.games.length, 0)

    // Only use the DB-driven layout when we actually have sections WITH
    // games assigned. If sections exist but are all empty (e.g. admin
    // created categories but hasn't linked games yet), fall through to
    // the legacy catalog path which also handles mock-mode auto-seeding.
    if (sections.length > 0 && totalGames > 0) {
      const counts: Partial<Record<PlayerCategorySlug, number>> = {}
      for (const s of sections) {
        // The CategoryTabs component is typed against the legacy 5-slug
        // union. We forward counts only for slugs it knows about; new
        // admin-created sections still render as rails below but won't
        // show up as tabs until the tab strip is upgraded.
        const slug = s.slug as PlayerCategorySlug
        counts[slug] = s.games.length
      }

      return (
        <div className="py-4">
          <LobbyHero
            headline="Welcome to the Frenzy"
            subhead="Get Free Sweep and Gold Coins Daily"
            alt="Welcome to the Frenzy — get free Sweep and Gold Coins daily"
            href="/lobby?shop=1"
          />
          <div className="mt-6">
            <CategoryTabs counts={counts} />
          </div>
          {sections.map((section) => (
            <Rail
              key={section.id}
              title={section.displayName}
              category={section.slug as PlayerCategorySlug}
              games={section.games.slice(0, RAIL_LIMIT)}
              currency={currency}
            />
          ))}
        </div>
      )
    }
  }

  // Legacy fallback — hardcoded category mapping.
  const games = await loadGamesCatalog({ currency })
  const counts = countsByPlayerCategory(games)
  const grouped = groupByPlayerCategory(games)

  return (
    <div className="py-4">
      <LobbyHero
        headline="Welcome to the Frenzy"
        subhead="Get Free Sweep and Gold Coins Daily"
        alt="Welcome to the Frenzy — get free Sweep and Gold Coins daily"
        href="/lobby?shop=1"
      />

      <div className="mt-6">
        <CategoryTabs counts={counts} />
      </div>

      <Rail
        title="Originals"
        category="originals"
        games={grouped.originals.slice(0, RAIL_LIMIT)}
        currency={currency}
      />
      <Rail
        title="Slots"
        category="slots"
        games={grouped.slots.slice(0, RAIL_LIMIT)}
        currency={currency}
      />
      <Rail
        title="Live Dealers"
        category="live-dealers"
        games={grouped['live-dealers'].slice(0, RAIL_LIMIT)}
        currency={currency}
      />
      <Rail
        title="Game Shows"
        category="game-shows"
        games={grouped['game-shows'].slice(0, RAIL_LIMIT)}
        currency={currency}
      />
      <Rail
        title="Live Games"
        category="live-games"
        games={grouped['live-games'].slice(0, RAIL_LIMIT)}
        currency={currency}
      />

      {games.length === 0 && (
        <div className="mt-10 rounded-md border border-dashed border-[var(--cf-border-default)] bg-[var(--cf-bg-card)]/40 p-10 text-center text-sm text-[var(--cf-gray-light)]">
          No games available for <span className="font-bold text-white">{currency}</span> right now.
          Toggle to <span className="font-bold text-white">{currency === 'GC' ? 'SC' : 'GC'}</span>{' '}
          in the top bar to keep browsing.
        </div>
      )}
    </div>
  )
}

function Rail({
  title,
  category,
  games,
  currency,
}: {
  title: string
  category: PlayerCategorySlug
  games: CatalogGame[]
  currency: 'GC' | 'SC'
}) {
  if (games.length === 0) return null
  const tiles: GameTileData[] = games.map((g) => ({
    id: g.id,
    slug: g.slug,
    displayName: g.displayName,
    thumbnailUrl: g.thumbnailUrl,
    providerName: g.providerDisplayName,
    badge: g.isNew ? 'NEW' : null,
  }))

  return (
    <GameRail
      title={title}
      seeAllHref={`/casino-games?category=${category}`}
      games={tiles}
      currency={currency}
    />
  )
}
