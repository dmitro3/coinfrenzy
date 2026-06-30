// docs/03 §8.5 — favorites engine.
//
// Three operations, all idempotent:
//
// - `list(ctx, playerId)` → ordered list of game IDs (newest first).
// - `set(ctx, { playerId, gameId, favorite })` → upsert or delete.
// - `toggle(ctx, { playerId, gameId })` → convenience helper that flips
//   the current state and returns the new one. Used by the API route
//   so the client doesn't have to read-modify-write.
//
// Service-layer guarantees:
//   - Validates the game exists + is customer-facing (no favoriting
//     deprecated/internal games).
//   - Idempotent at the storage layer (composite PK + DELETE-if-exists).
//   - No audit row (low-stakes preference; see docs/03 §8.5 note).
//   - No CRM event (closed event taxonomy in docs/11 §1 — would require
//     a separate `player.game.favorited` entry; see open questions).

import { and, asc, desc, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

export interface FavoriteRow {
  gameId: string
  favoritedAt: Date
}

export type SetFavoriteError = { code: 'game_not_found' } | { code: 'game_not_available' }

export interface SetFavoriteInput {
  playerId: string
  gameId: string
  favorite: boolean
}

export interface SetFavoriteSuccess {
  favorite: boolean
  /** New total count for the player after the write completes. */
  count: number
}

/**
 * Player's favorite list, newest first. Returns just the IDs because the
 * caller already has (or will fetch) the full game catalog and join in
 * memory — keeps this query a clean PK-driven scan.
 */
export async function list(ctx: Context, playerId: string): Promise<FavoriteRow[]> {
  return ctx.db
    .select({
      gameId: schema.playerFavorites.gameId,
      favoritedAt: schema.playerFavorites.favoritedAt,
    })
    .from(schema.playerFavorites)
    .where(eq(schema.playerFavorites.playerId, playerId))
    .orderBy(desc(schema.playerFavorites.favoritedAt), asc(schema.playerFavorites.gameId))
}

/**
 * Set the favorite state for a (player, game) pair. Idempotent in both
 * directions — calling `favorite=true` twice yields a single row,
 * calling `favorite=false` on an unfavorited game is a no-op.
 *
 * Validates that the game is real + customer-facing so we never end up
 * with orphaned favorites pointing at deprecated catalog entries. The
 * RLS policy on player_favorites enforces player-owns-row at the DB
 * level; this function is the typed entry point on top of it.
 */
export async function set(
  ctx: Context,
  input: SetFavoriteInput,
): Promise<Result<SetFavoriteSuccess, SetFavoriteError>> {
  const gameRows = await ctx.db
    .select({
      id: schema.games.id,
      status: schema.games.status,
      customerFacing: schema.games.customerFacing,
    })
    .from(schema.games)
    .where(eq(schema.games.id, input.gameId))
    .limit(1)

  const game = gameRows[0]
  if (!game) return err({ code: 'game_not_found' })
  if (game.status !== 'active' || !game.customerFacing) {
    return err({ code: 'game_not_available' })
  }

  if (input.favorite) {
    await ctx.db
      .insert(schema.playerFavorites)
      .values({
        playerId: input.playerId,
        gameId: input.gameId,
      })
      .onConflictDoNothing({
        target: [schema.playerFavorites.playerId, schema.playerFavorites.gameId],
      })
  } else {
    await ctx.db
      .delete(schema.playerFavorites)
      .where(
        and(
          eq(schema.playerFavorites.playerId, input.playerId),
          eq(schema.playerFavorites.gameId, input.gameId),
        ),
      )
  }

  const countRows = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.playerFavorites)
    .where(eq(schema.playerFavorites.playerId, input.playerId))

  return ok({
    favorite: input.favorite,
    count: countRows[0]?.count ?? 0,
  })
}

/**
 * Read current state + write the opposite. Single round-trip from the
 * client's perspective — the API route uses this so the star button
 * stays a fire-and-forget POST.
 */
export async function toggle(
  ctx: Context,
  input: { playerId: string; gameId: string },
): Promise<Result<SetFavoriteSuccess, SetFavoriteError>> {
  const existing = await ctx.db
    .select({ gameId: schema.playerFavorites.gameId })
    .from(schema.playerFavorites)
    .where(
      and(
        eq(schema.playerFavorites.playerId, input.playerId),
        eq(schema.playerFavorites.gameId, input.gameId),
      ),
    )
    .limit(1)

  const currentlyFavorite = existing.length > 0
  return set(ctx, {
    playerId: input.playerId,
    gameId: input.gameId,
    favorite: !currentlyFavorite,
  })
}
