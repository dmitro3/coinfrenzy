import type { CatalogGame } from './games-catalog'
import type { PlayerCategorySlug } from '@coinfrenzy/ui/player'

// DEPRECATED for layout — kept as a fallback only.
//
// As of migration 0012 the canonical mapping lives in
// `casino_sub_categories` + `casino_sub_category_games` and the lobby
// page reads from those tables via `loadDbLobbySections()` whenever
// `USE_DB_LOBBY_LAYOUT` is true. This hardcoded MAP is only consulted
// when the DB-driven path returns no sections (e.g. on a fresh DB before
// the migration runs, or when the operator explicitly disables the flag).
//
// Maps the internal Alea-driven `category` column on `games` to the
// five player-facing categories from the live site (Originals, Slots,
// Live Dealers, Game Shows, Live Games). Anything that doesn't match
// drops into Originals so it stays visible to the player rather than
// being orphaned.

const MAP: Record<string, PlayerCategorySlug> = {
  // Slots
  slots: 'slots',
  slot: 'slots',
  // Originals — house-built crash / dice / table style games
  originals: 'originals',
  original: 'originals',
  crash: 'originals',
  table: 'originals',
  card: 'originals',
  instant: 'originals',
  // Live dealer studios
  'live-dealer': 'live-dealers',
  'live-dealers': 'live-dealers',
  'live-casino': 'live-dealers',
  live: 'live-dealers',
  // Game show studios
  'game-show': 'game-shows',
  'game-shows': 'game-shows',
  gameshow: 'game-shows',
  // Live games (real-time / streaming style mini-games)
  'live-game': 'live-games',
  'live-games': 'live-games',
}

export function toPlayerCategory(internal: string | null | undefined): PlayerCategorySlug {
  if (!internal) return 'originals'
  return MAP[internal.toLowerCase()] ?? 'originals'
}

export function groupByPlayerCategory(
  games: CatalogGame[],
): Record<PlayerCategorySlug, CatalogGame[]> {
  const buckets: Record<PlayerCategorySlug, CatalogGame[]> = {
    originals: [],
    slots: [],
    'live-dealers': [],
    'game-shows': [],
    'live-games': [],
  }
  for (const game of games) {
    buckets[toPlayerCategory(game.category)].push(game)
  }
  return buckets
}

export function countsByPlayerCategory(games: CatalogGame[]): Record<PlayerCategorySlug, number> {
  const buckets = groupByPlayerCategory(games)
  return {
    originals: buckets.originals.length,
    slots: buckets.slots.length,
    'live-dealers': buckets['live-dealers'].length,
    'game-shows': buckets['game-shows'].length,
    'live-games': buckets['live-games'].length,
  }
}
