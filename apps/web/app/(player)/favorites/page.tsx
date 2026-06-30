import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { eq } from 'drizzle-orm'

import { EmptyState, GameGrid, type GameTileData } from '@coinfrenzy/ui/player'
import { withActor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getActiveCurrency } from '@/lib/active-currency'
import { loadGamesCatalog } from '@/lib/games-catalog'
import { requirePlayerSession } from '@/lib/player-session'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 + docs/03 §8.5 — Favorites page.
//
// Server-side: read the player's favorite IDs through `withActor` (so
// RLS confirms they own the rows), then join against the cached games
// catalog and project into the same `GameTileData` shape the lobby +
// /casino-games render. Keeping the join in memory (instead of a
// second SQL join) means the catalog cache wins for free.
//
// Empty list keeps the existing "No favorites yet" empty state with a
// CTA back to the lobby — the founder asked for this branded surface
// to stay (see the screenshot in the prompt brief).

export default async function FavoritesPage() {
  const session = await requirePlayerSession('/favorites')
  const currency = await getActiveCurrency()
  const catalog = await loadGamesCatalog({ currency })

  const favoriteIds = await withActor(session.player.id, 'player', null, (tx) =>
    tx
      .select({ gameId: schema.playerFavorites.gameId })
      .from(schema.playerFavorites)
      .where(eq(schema.playerFavorites.playerId, session.player.id)),
  )

  const idSet = new Set(favoriteIds.map((r) => r.gameId))
  const favorites: GameTileData[] = catalog
    .filter((g) => idSet.has(g.id))
    .map((g) => ({
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      thumbnailUrl: g.thumbnailUrl,
      providerName: g.providerDisplayName,
      badge: g.isNew ? 'NEW' : null,
    }))

  return (
    <div className="py-4">
      <Link
        href="/lobby"
        className="inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ChevronLeft className="h-4 w-4" /> Favorites
      </Link>

      {favorites.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            headline="No favorites yet"
            sub="Star a game in the lobby to pin it here for one-click play."
            action={{ label: 'Browse the lobby', href: '/lobby' }}
          />
        </div>
      ) : (
        <div className="mt-6">
          <GameGrid games={favorites} currency={currency} />
        </div>
      )}
    </div>
  )
}
