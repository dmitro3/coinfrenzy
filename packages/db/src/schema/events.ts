import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, emptyJsonbDefault, money } from './_shared'

// docs/03 §8.1 — player_events. Partitioned by month on created_at.

export const playerEvents = pgTable(
  'player_events',
  {
    id: uuid('id').notNull().defaultRandom(),
    playerId: uuid('player_id').notNull(),

    eventName: text('event_name').notNull(),
    eventCategory: text('event_category').notNull(),

    payload: jsonb('payload').notNull().default(emptyJsonbDefault),

    gameId: uuid('game_id'),
    amount: money('amount'),
    currency: text('currency'),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    index('player_events_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('player_events_name_idx').on(t.eventName, sql`${t.createdAt} desc`),
    index('player_events_category_idx').on(t.eventCategory, sql`${t.createdAt} desc`),
    index('player_events_game_idx')
      .on(t.gameId, sql`${t.createdAt} desc`)
      .where(sql`${t.gameId} is not null`),
  ],
)
