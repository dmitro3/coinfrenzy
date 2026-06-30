import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { desc, eq, inArray, isNull, and, sql } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'

import { EmptyState, GameGrid, type GameTileData } from '@coinfrenzy/ui/player'

import { getActiveCurrency } from '@/lib/active-currency'
import { requirePlayerSession } from '@/lib/player-session'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 + M5 — Recent Games. Pulls the player's most recently
// played games from `game_sessions`, joined back to `games` so we have
// a thumbnail + provider name for the tile.

export default async function RecentGamesPage() {
  const session = await requirePlayerSession('/recent-games')
  const currency = await getActiveCurrency()
  const db = getDb()

  // Most recent distinct games the player has launched. We pull the
  // top 50 sessions and dedupe in code so we don't need a window
  // function — keeps the query simple and fast for any DB plan.
  const sessions = await db
    .select({
      gameId: schema.gameSessions.gameId,
      startedAt: schema.gameSessions.startedAt,
    })
    .from(schema.gameSessions)
    .where(eq(schema.gameSessions.playerId, session.player.id))
    .orderBy(desc(schema.gameSessions.startedAt))
    .limit(50)

  const seen = new Set<string>()
  const distinctIds: string[] = []
  for (const row of sessions) {
    if (seen.has(row.gameId)) continue
    seen.add(row.gameId)
    distinctIds.push(row.gameId)
    if (distinctIds.length >= 24) break
  }

  let tiles: GameTileData[] = []
  if (distinctIds.length > 0) {
    const games = await db
      .select({
        id: schema.games.id,
        slug: schema.games.slug,
        displayName: schema.games.displayName,
        thumbnailUrl: schema.games.thumbnailUrl,
        providerName: schema.gameProviders.displayName,
      })
      .from(schema.games)
      .innerJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
      .where(and(inArray(schema.games.id, distinctIds), isNull(schema.games.deletedAt)))

    // Sort by the order in distinctIds (most recent first)
    const order = new Map(distinctIds.map((id, i) => [id, i]))
    games.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))

    tiles = games.map((g) => ({
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      thumbnailUrl: g.thumbnailUrl,
      providerName: g.providerName,
    }))
  }

  // Touch sql to avoid an unused import lint when distinctIds is empty.
  void sql

  return (
    <div className="py-4">
      <Link
        href="/lobby"
        className="inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ChevronLeft className="h-4 w-4" /> Recent Games
      </Link>

      {tiles.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            headline="No recent games"
            sub="Launch a game from the lobby and we'll keep it handy here."
            action={{ label: 'Browse the lobby', href: '/lobby' }}
          />
        </div>
      ) : (
        <div className="mt-6">
          <GameGrid games={tiles} currency={currency} />
        </div>
      )}
    </div>
  )
}
