-- docs/03 §8.5 — `player_favorites`.
--
-- Per-player game bookmarks. The lobby tile star (hover-reveal, top-right)
-- and the `/favorites` page read from this table; the immersive game
-- footer writes through `core.favorites.set()` so the same starred state
-- follows the player from any tile click into the game and back.
--
-- Unlike most player-owned tables, the RLS policy here grants players
-- INSERT + DELETE on their own rows. The favorite list is entirely
-- player-owned UX — there is no admin write path and no internal job
-- that mutates it. The core helper (`packages/core/src/favorites`)
-- still goes through the service layer for typing + observability, but
-- a player-actor connection has the SQL grants it needs to do the work.

CREATE TABLE IF NOT EXISTS "player_favorites" (
  "player_id"    uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "game_id"      uuid NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "favorited_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "player_favorites_pk" PRIMARY KEY ("player_id", "game_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "player_favorites_player_idx"
  ON "player_favorites" ("player_id", "favorited_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "player_favorites_game_idx"
  ON "player_favorites" ("game_id");
--> statement-breakpoint

ALTER TABLE "player_favorites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Players can read their own favorites.
CREATE POLICY "player_favorites_player_read" ON "player_favorites" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint

-- Players can insert their own favorites (favorite a game).
CREATE POLICY "player_favorites_player_insert" ON "player_favorites" FOR INSERT
  WITH CHECK (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint

-- Players can delete their own favorites (un-favorite a game).
CREATE POLICY "player_favorites_player_delete" ON "player_favorites" FOR DELETE
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint

-- Admins can read all (powers the "Games played + favorite" cell on the
-- player-detail right rail per docs/08 §3).
CREATE POLICY "player_favorites_admin_read" ON "player_favorites" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
