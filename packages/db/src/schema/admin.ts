import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt, deletedAt, emptyJsonArrayDefault, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §10.1 — admin_roles.

export const adminRoles = pgTable('admin_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  level: integer('level').notNull(),

  permissions: jsonb('permissions').notNull().default(emptyJsonArrayDefault),

  redemptionApproveMaxUsd: bigint('redemption_approve_max_usd', { mode: 'bigint' }),
  adjustmentMaxUsd: bigint('adjustment_max_usd', { mode: 'bigint' }),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// docs/03 §10.2 — admins.

export const admins = pgTable(
  'admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),

    passwordHash: text('password_hash').notNull(),
    passwordSetAt: tstz('password_set_at').notNull().defaultNow(),

    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    totpEnabledAt: tstz('totp_enabled_at'),
    backupCodes: text('backup_codes'),

    mustResetPassword: boolean('must_reset_password').notNull().default(false),

    status: text('status').notNull().default('active'),
    statusReason: text('status_reason'),

    lastLoginAt: tstz('last_login_at'),
    lastLoginIp: inet('last_login_ip'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('admins_email_idx').on(sql`lower(${t.email})`),
    index('admins_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} is null`),
    check('admins_status_check', sql`${t.status} in ('active', 'suspended', 'terminated')`),
  ],
)

// docs/03 §10.3 — admin_role_assignments.

export const adminRoleAssignments = pgTable(
  'admin_role_assignments',
  {
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'restrict' }),

    grantedAt: tstz('granted_at').notNull().defaultNow(),
    grantedBy: uuid('granted_by').references(() => admins.id),
  },
  (t) => [
    primaryKey({ columns: [t.adminId, t.roleId] }),
    index('admin_role_assignments_admin_idx').on(t.adminId),
    index('admin_role_assignments_role_idx').on(t.roleId),
  ],
)

// docs/03 §10.4 — admin_permissions.

export const adminPermissions = pgTable(
  'admin_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    resource: text('resource').notNull(),
    action: text('action').notNull(),

    scope: jsonb('scope'),

    grantedAt: tstz('granted_at').notNull().defaultNow(),
    grantedBy: uuid('granted_by').references(() => admins.id),
    expiresAt: tstz('expires_at'),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [
    unique('admin_permissions_admin_resource_action_unique').on(t.adminId, t.resource, t.action),
    index('admin_permissions_admin_idx')
      .on(t.adminId)
      .where(sql`${t.revokedAt} is null`),
  ],
)

// docs/03 §10.5 — admin_sessions.

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),

    bindIp: inet('bind_ip'),
    bindUaHash: text('bind_ua_hash'),

    createdAt: createdAt(),
    expiresAt: tstz('expires_at').notNull(),
    lastActiveAt: tstz('last_active_at').notNull().defaultNow(),

    revokedAt: tstz('revoked_at'),
    revokedReason: text('revoked_reason'),
    revokedBy: uuid('revoked_by').references(() => admins.id),
  },
  (t) => [
    index('admin_sessions_admin_idx').on(t.adminId, sql`${t.createdAt} desc`),
    index('admin_sessions_active_idx')
      .on(t.expiresAt)
      .where(sql`${t.revokedAt} is null`),
  ],
)

// docs/03 §10.7 — admin UX tables.

export const adminDashboardLayouts = pgTable('admin_dashboard_layouts', {
  adminId: uuid('admin_id')
    .primaryKey()
    .references(() => admins.id, { onDelete: 'cascade' }),
  layout: jsonb('layout').notNull(),
  updatedAt: updatedAt(),
})

export const adminSavedViews = pgTable(
  'admin_saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    name: text('name').notNull(),
    filterConfig: jsonb('filter_config').notNull(),
    columnConfig: jsonb('column_config'),
    isShared: boolean('is_shared').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('admin_saved_views_scope_idx').on(t.scope, t.adminId)],
)

export const adminNotes = pgTable(
  'admin_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id),
    note: text('note').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('admin_notes_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('admin_notes_pinned_idx')
      .on(t.playerId)
      .where(sql`${t.pinned} = true`),
  ],
)

export const customQueryDefinitions = pgTable('custom_query_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id')
    .notNull()
    .references(() => admins.id),
  name: text('name').notNull(),
  description: text('description'),
  queryConfig: jsonb('query_config').notNull(),
  schedule: text('schedule'),
  lastRunAt: tstz('last_run_at'),
  createdAt: createdAt(),
})
