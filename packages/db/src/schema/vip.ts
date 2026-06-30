import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, emptyJsonbDefault } from './_shared'
import { admins } from './admin'
import { players } from './players'

// M4 — Host / VIP interactions log. Every host action against one of their
// assigned VIPs writes a row here: calls, texts, meetings, sent bonuses,
// sent messages, and free-form notes. RLS scopes hosts to their own rows
// (declared in 0010_vip_hosts.sql).

export const hostPlayerInteractions = pgTable(
  'host_player_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    hostId: uuid('host_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    interactionType: text('interaction_type').notNull(),
    notes: text('notes'),
    outcome: text('outcome'),

    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    createdAt: createdAt(),
  },
  (t) => [
    index('host_player_interactions_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('host_player_interactions_host_idx').on(t.hostId, sql`${t.createdAt} desc`),
    index('host_player_interactions_type_idx').on(t.interactionType, sql`${t.createdAt} desc`),
    check(
      'host_player_interactions_type_check',
      sql`${t.interactionType} in ('call', 'text', 'email', 'in_person', 'bonus_sent', 'note', 'message_sent', 'system')`,
    ),
    check(
      'host_player_interactions_outcome_check',
      sql`${t.outcome} is null or ${t.outcome} in ('positive', 'neutral', 'negative', 'no_response')`,
    ),
  ],
)
