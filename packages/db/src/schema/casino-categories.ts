import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt, emptyJsonbDefault, tstz, updatedAt } from './_shared'
import { games } from './games'

// docs/03 §4 + docs/08 §4 — Casino sub-categories. Replaces the JSONB hack
// in site_content that the M3 admin shell was using as a placeholder.
//
// Each row is one section of the player lobby (Originals, Slots, Live
// Dealers, Game Shows, Live Games, or any new section an admin creates).
// `ordering` controls the section's place in the lobby; `in_lobby = false`
// hides the section from the player site but keeps it editable in admin.

export const casinoSubCategories = pgTable(
  'casino_sub_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),

    type: text('type').notNull().default('slots'),
    thumbnailUrl: text('thumbnail_url'),

    ordering: integer('ordering').notNull().default(0),

    status: text('status').notNull().default('active'),
    inLobby: boolean('in_lobby').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),

    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    updatedBy: uuid('updated_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('casino_sub_categories_ordering_idx')
      .on(t.ordering)
      .where(sql`${t.status} = 'active'`),
    index('casino_sub_categories_lobby_idx')
      .on(t.ordering)
      .where(sql`${t.inLobby} = true and ${t.status} = 'active'`),
    check('casino_sub_categories_status_check', sql`${t.status} in ('active', 'inactive')`),
  ],
)

// docs/03 §4 — join table. One row per (section, game). `ordering`
// controls the game's place within that section's rail. A single game
// can live in many sections (e.g. a slot can be both in "Slots" and a
// curated "Hot Games" section).

export const casinoSubCategoryGames = pgTable(
  'casino_sub_category_games',
  {
    subCategoryId: uuid('sub_category_id')
      .notNull()
      .references(() => casinoSubCategories.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),

    ordering: integer('ordering').notNull().default(0),

    addedBy: uuid('added_by'),
    addedAt: tstz('added_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.subCategoryId, t.gameId] }),
    index('casino_sub_category_games_section_idx').on(t.subCategoryId, t.ordering),
    index('casino_sub_category_games_game_idx').on(t.gameId),
  ],
)
