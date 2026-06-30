import { sql } from 'drizzle-orm'
import { index, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { money, tstz } from './_shared'
import { games } from './games'
import { players } from './players'

// docs/03 §8.5 — player_favorites.
//
// Player-owned bookmark list. Distinct from player_game_stats: that one
// is a *derived* roll-up of every game the player has actually played;
// this is the explicit "I starred this" list that powers the lobby
// star button + /favorites page. Two rows max per (player, game) is
// enforced by the composite primary key.

export const playerFavorites = pgTable(
  'player_favorites',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    favoritedAt: tstz('favorited_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.gameId] }),
    index('player_favorites_player_idx').on(t.playerId, sql`${t.favoritedAt} desc`),
    index('player_favorites_game_idx').on(t.gameId),
  ],
)

// docs/03 §8.2 — player_lifetime_stats.

export const playerLifetimeStats = pgTable(
  'player_lifetime_stats',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => players.id, { onDelete: 'cascade' }),

    totalDepositedUsd: money('total_deposited_usd')
      .notNull()
      .default(sql`0`),
    totalRedeemedUsd: money('total_redeemed_usd')
      .notNull()
      .default(sql`0`),
    netPositionUsd: money('net_position_usd')
      .notNull()
      .default(sql`0`),
    purchaseCount: integer('purchase_count').notNull().default(0),
    redemptionCount: integer('redemption_count').notNull().default(0),
    pendingRedemptionCount: integer('pending_redemption_count').notNull().default(0),

    totalWageredGc: money('total_wagered_gc')
      .notNull()
      .default(sql`0`),
    totalWageredSc: money('total_wagered_sc')
      .notNull()
      .default(sql`0`),
    totalWonGc: money('total_won_gc')
      .notNull()
      .default(sql`0`),
    totalWonSc: money('total_won_sc')
      .notNull()
      .default(sql`0`),
    ggrSc: money('ggr_sc')
      .notNull()
      .default(sql`0`),
    ngrSc: money('ngr_sc')
      .notNull()
      .default(sql`0`),
    sessionCount: integer('session_count').notNull().default(0),
    roundCount: integer('round_count').notNull().default(0),
    daysActive: integer('days_active').notNull().default(0),

    firstPurchaseAt: tstz('first_purchase_at'),
    lastPurchaseAt: tstz('last_purchase_at'),
    firstSessionAt: tstz('first_session_at'),
    lastSessionAt: tstz('last_session_at'),

    emailsReceivedLifetime: integer('emails_received_lifetime').notNull().default(0),
    emailsOpenedLifetime: integer('emails_opened_lifetime').notNull().default(0),
    emailsClickedLifetime: integer('emails_clicked_lifetime').notNull().default(0),

    computedAt: tstz('computed_at').notNull().defaultNow(),
  },
  (t) => [
    index('player_lifetime_stats_deposited_idx').on(sql`${t.totalDepositedUsd} desc`),
    index('player_lifetime_stats_ngr_idx').on(sql`${t.ngrSc} desc`),
    index('player_lifetime_stats_last_purchase_idx').on(sql`${t.lastPurchaseAt} desc`),
  ],
)

// docs/03 §8.3 — player_30d_stats.

export const player30dStats = pgTable(
  'player_30d_stats',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => players.id, { onDelete: 'cascade' }),

    depositedUsd30d: money('deposited_usd_30d')
      .notNull()
      .default(sql`0`),
    redeemedUsd30d: money('redeemed_usd_30d')
      .notNull()
      .default(sql`0`),
    wageredSc30d: money('wagered_sc_30d')
      .notNull()
      .default(sql`0`),
    ngrSc30d: money('ngr_sc_30d')
      .notNull()
      .default(sql`0`),
    sessionCount30d: integer('session_count_30d').notNull().default(0),
    daysActive30d: integer('days_active_30d').notNull().default(0),

    lastPurchaseAt: tstz('last_purchase_at'),
    lastSessionAt: tstz('last_session_at'),
    lastLoginAt: tstz('last_login_at'),

    computedAt: tstz('computed_at').notNull().defaultNow(),
  },
  (t) => [
    index('player_30d_stats_active_idx').on(sql`${t.lastLoginAt} desc`),
    index('player_30d_stats_wagered_idx').on(sql`${t.wageredSc30d} desc`),
  ],
)

// docs/03 §8.4 — player_game_stats.

export const playerGameStats = pgTable(
  'player_game_stats',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),

    totalBetSc: money('total_bet_sc')
      .notNull()
      .default(sql`0`),
    totalWinSc: money('total_win_sc')
      .notNull()
      .default(sql`0`),
    roundCount: integer('round_count').notNull().default(0),
    firstPlayedAt: tstz('first_played_at').notNull(),
    lastPlayedAt: tstz('last_played_at').notNull(),

    last7dWageredSc: money('last_7d_wagered_sc')
      .notNull()
      .default(sql`0`),
    last7dRounds: integer('last_7d_rounds').notNull().default(0),

    last30dWageredSc: money('last_30d_wagered_sc')
      .notNull()
      .default(sql`0`),
    last30dRounds: integer('last_30d_rounds').notNull().default(0),

    computedAt: tstz('computed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.gameId] }),
    index('player_game_stats_player_idx').on(t.playerId, sql`${t.totalBetSc} desc`),
    index('player_game_stats_game_idx').on(t.gameId, sql`${t.totalBetSc} desc`),
    index('player_game_stats_recent_idx')
      .on(t.gameId, sql`${t.last7dWageredSc} desc`)
      .where(sql`${t.last7dWageredSc} > 0`),
  ],
)
