import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { tstz, updatedAt } from './_shared'
import { players } from './players'

// Better Auth tables (docs/09 §5.1).
//
// Better Auth manages the authentication identity for players. The auth_user
// row is the long-lived credential record; the players row is the casino
// domain record. Both share the same UUID: on signup we let Better Auth
// generate the id, then create the players row with the same id.
//
// Why a separate table at all (rather than putting auth columns on players):
// Better Auth needs a stable shape (id/email/emailVerified/name/image plus
// the credentials/sessions joins) and shipping its expected column names is
// less risky than retrofitting players. The 1:1 FK enforces consistency.
//
// Singular table names match Better Auth's drizzle adapter defaults; we
// prefix with `auth_` to keep them grouped in the catalog and out of the
// way of the casino domain tables.

export const authUser = pgTable(
  'auth_user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('auth_user_email_idx').on(sql`lower(${t.email})`)],
)

export const authTwoFactor = pgTable(
  'auth_two_factor',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
  },
  (t) => [index('auth_two_factor_user_idx').on(t.userId)],
)

export const authSession = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_session_user_idx').on(t.userId),
    index('auth_session_expires_idx').on(t.expiresAt),
  ],
)

export const authAccount = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_account_user_idx').on(t.userId),
    index('auth_account_provider_idx').on(t.providerId, t.accountId),
  ],
)

export const authVerification = pgTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
)

// Pending RG limit changes: 24h delay for increases (docs/09 §7.2).
//
// We model the delay as a queue: when a player asks to RAISE a limit, we
// write a row here with apply_at = now + 24h. An Inngest cron promotes
// matured rows into players.rg_deposit_limit_*. Decreases are applied
// immediately (no queue entry).

export const playerLimitChanges = pgTable(
  'player_limit_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    limitKind: text('limit_kind').notNull(),
    previousValue: text('previous_value'),
    nextValue: text('next_value').notNull(),
    direction: text('direction').notNull(),

    // The migration (0006_better_auth.sql) created this column as
    // `requested_at`, not `created_at`. Using `createdAt()` here would
    // make Drizzle emit `"created_at"` in queries and the database
    // would 42703 — see the responsible-gaming page bug fix.
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    applyAt: tstz('apply_at').notNull(),
    appliedAt: tstz('applied_at'),
    cancelledAt: tstz('cancelled_at'),

    updatedAt: updatedAt(),
  },
  (t) => [
    index('player_limit_changes_player_idx').on(t.playerId, sql`${t.requestedAt} desc`),
    index('player_limit_changes_pending_idx')
      .on(t.applyAt)
      .where(sql`${t.appliedAt} is null and ${t.cancelledAt} is null`),
  ],
)
