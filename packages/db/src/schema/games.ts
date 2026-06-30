import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt, deletedAt, emptyJsonbDefault, money, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §4.1 — aggregators. Seed: alea.
// Migration 0012 added the integration-wiring columns (callback_url,
// webhook_secret_ref, features, version, last_seen_at, error_count_1h,
// contact_email, notes) so the senior dev has a place to land
// AleaPlay / Marbles / future aggregator configs.
//
// `webhook_secret_ref` stores the Doppler key name only — NEVER the
// actual secret value (per .cursorrules).
export const aggregators = pgTable('aggregators', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  apiBaseUrl: text('api_base_url'),
  callbackUrl: text('callback_url'),
  webhookSecretRef: text('webhook_secret_ref'),
  status: text('status').notNull().default('active'),
  config: jsonb('config').notNull().default(emptyJsonbDefault),
  features: jsonb('features').notNull().default(emptyJsonbDefault),
  version: text('version'),
  lastSeenAt: tstz('last_seen_at'),
  errorCount1h: integer('error_count_1h').notNull().default(0),
  contactEmail: text('contact_email'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// docs/03 §4.2 — game_providers.
export const gameProviders = pgTable(
  'game_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregatorId: uuid('aggregator_id')
      .notNull()
      .references(() => aggregators.id),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    logoUrl: text('logo_url'),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('game_providers_aggregator_slug_unique').on(t.aggregatorId, t.slug),
    index('game_providers_aggregator_idx').on(t.aggregatorId, t.status),
    check('game_providers_status_check', sql`${t.status} in ('active', 'inactive', 'maintenance')`),
  ],
)

// docs/03 §4.3 — games.
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => gameProviders.id),

    slug: text('slug').notNull().unique(),
    externalId: text('external_id').notNull(),
    displayName: text('display_name').notNull(),

    category: text('category').notNull(),
    subCategory: text('sub_category'),

    thumbnailUrl: text('thumbnail_url'),
    bannerUrl: text('banner_url'),

    // rtp: numeric('rtp', { precision: 5, scale: 4 }),
    rtp: numeric('rtp'),
    volatility: text('volatility'),
    minBetSc: money('min_bet_sc'),
    maxBetSc: money('max_bet_sc'),

    playthroughWeight: numeric('playthrough_weight', { precision: 5, scale: 4 })
      .notNull()
      .default('1.0'),

    status: text('status').notNull().default('active'),
    customerFacing: boolean('customer_facing').notNull().default(true),
    availableInGc: boolean('available_in_gc').notNull().default(true),
    availableInSc: boolean('available_in_sc').notNull().default(true),

    lobbyOrder: integer('lobby_order').default(0),
    isFeatured: boolean('is_featured').notNull().default(false),
    isNew: boolean('is_new').notNull().default(false),

    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('games_provider_idx').on(t.providerId),
    index('games_category_idx')
      .on(t.category, t.status)
      .where(sql`${t.deletedAt} is null`),
    index('games_status_idx')
      .on(t.status, t.customerFacing)
      .where(sql`${t.deletedAt} is null`),
    index('games_lobby_idx')
      .on(t.lobbyOrder)
      .where(sql`${t.customerFacing} = true and ${t.status} = 'active'`),
    index('games_featured_idx')
      .on(t.isFeatured)
      .where(sql`${t.isFeatured} = true`),
    check('games_status_check', sql`${t.status} in ('active', 'inactive', 'maintenance')`),
  ],
)

// docs/03 §4.4 — game_sessions.
export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),

    currency: text('currency').notNull(),

    aleaSessionToken: text('alea_session_token'),
    aleaPlayUrl: text('alea_play_url'),

    totalBet: money('total_bet')
      .notNull()
      .default(sql`0`),
    totalWin: money('total_win')
      .notNull()
      .default(sql`0`),
    roundCount: integer('round_count').notNull().default(0),

    status: text('status').notNull().default('active'),

    launchIp: inet('launch_ip'),
    launchState: text('launch_state'),

    startedAt: tstz('started_at').notNull().defaultNow(),
    endedAt: tstz('ended_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('game_sessions_player_idx').on(t.playerId, sql`${t.startedAt} desc`),
    index('game_sessions_game_idx').on(t.gameId, sql`${t.startedAt} desc`),
    index('game_sessions_status_idx')
      .on(t.status, sql`${t.startedAt} desc`)
      .where(sql`${t.status} = 'active'`),
    check('game_sessions_currency_check', sql`${t.currency} in ('GC', 'SC')`),
    check('game_sessions_status_check', sql`${t.status} in ('active', 'closed', 'abandoned')`),
  ],
)

// docs/03 §4.5 — game_rounds. Partitioned by month on created_at.
export const gameRounds = pgTable(
  'game_rounds',
  {
    id: uuid('id').notNull().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    playerId: uuid('player_id').notNull(),
    gameId: uuid('game_id').notNull(),

    externalRoundId: text('external_round_id').notNull(),

    betAmount: money('bet_amount').notNull(),
    winAmount: money('win_amount')
      .notNull()
      .default(sql`0`),
    currency: text('currency').notNull(),

    status: text('status').notNull(),

    outcome: jsonb('outcome'),

    betAt: tstz('bet_at').notNull(),
    wonAt: tstz('won_at'),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    uniqueIndex('game_rounds_external_idx').on(t.externalRoundId, t.createdAt),
    // Plain (non-partition-key) index so queries by external_round_id alone
    // (without created_at) can do an index scan across all monthly partitions
    // instead of a full cross-partition sequential scan. Required for the
    // round.bet idempotency check and round.win round lookup.
    index('game_rounds_external_only_idx').on(t.externalRoundId),
    index('game_rounds_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('game_rounds_session_idx').on(t.sessionId, sql`${t.createdAt} desc`),
    index('game_rounds_game_idx').on(t.gameId, sql`${t.createdAt} desc`),
    check('game_rounds_currency_check', sql`${t.currency} in ('GC', 'SC')`),
    check('game_rounds_status_check', sql`${t.status} in ('bet_placed', 'resolved', 'refunded')`),
  ],
)

// docs/04 §7.2 — alea_reconciliation_findings.
// Output of the nightly Alea round reconciliation. Each row is one
// discrepancy between Alea's authoritative round list and our local
// game_rounds. The reconcile cron writes here; the admin Integrity page
// reads from here; PagerDuty pages on SEV-1 rows.
export const aleaReconciliationFindings = pgTable(
  'alea_reconciliation_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runStartedAt: tstz('run_started_at').notNull(),
    windowStartAt: tstz('window_start_at').notNull(),
    windowEndAt: tstz('window_end_at').notNull(),
    externalRoundId: text('external_round_id').notNull(),
    kind: text('kind').notNull(),
    severity: text('severity').notNull().default('warn'),
    aleaBet: money('alea_bet'),
    aleaWin: money('alea_win'),
    oursBet: money('ours_bet'),
    oursWin: money('ours_win'),
    currency: text('currency'),
    playerId: uuid('player_id'),
    gameId: uuid('game_id'),
    status: text('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: tstz('resolved_at'),
    resolutionNotes: text('resolution_notes'),
    detail: jsonb('detail'),
    createdAt: createdAt(),
  },
  (t) => [
    index('alea_reconciliation_findings_open_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'open'`),
    index('alea_reconciliation_findings_round_idx').on(t.externalRoundId),
    index('alea_reconciliation_findings_run_idx').on(t.runStartedAt),
    check(
      'alea_reconciliation_findings_kind_check',
      sql`${t.kind} in ('missing_from_ours', 'missing_from_alea', 'amount_mismatch', 'currency_mismatch', 'status_mismatch')`,
    ),
    check(
      'alea_reconciliation_findings_severity_check',
      sql`${t.severity} in ('info', 'warn', 'critical')`,
    ),
    check(
      'alea_reconciliation_findings_status_check',
      sql`${t.status} in ('open', 'resolved', 'ignored', 'replayed')`,
    ),
  ],
)
