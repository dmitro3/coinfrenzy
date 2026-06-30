import { sql } from 'drizzle-orm'
import { boolean, index, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt } from './_shared'
import { players } from './players'

// docs/03 §2.5 — geo_history.

export const geoHistory = pgTable(
  'geo_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    action: text('action').notNull(),
    resourceId: uuid('resource_id'),

    ip: inet('ip').notNull(),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    postalCode: text('postal_code'),

    isProxy: boolean('is_proxy').default(false),
    isMocked: boolean('is_mocked').default(false),
    isCompromised: boolean('is_compromised').default(false),
    isJumped: boolean('is_jumped').default(false),
    isInaccurate: boolean('is_inaccurate').default(false),

    userAgent: text('user_agent'),
    deviceId: text('device_id'),

    radarResponse: jsonb('radar_response'),

    createdAt: createdAt(),
  },
  (t) => [
    index('geo_history_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('geo_history_action_idx').on(t.action, sql`${t.createdAt} desc`),
    index('geo_history_ip_idx').on(t.ip),
    index('geo_history_state_idx').on(t.state, sql`${t.createdAt} desc`),
  ],
)
