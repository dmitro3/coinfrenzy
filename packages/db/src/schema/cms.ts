import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { createdAt, tstz, updatedAt } from './_shared'
import { crmSegments } from './crm'
import { players } from './players'

// docs/03 §11 — site_content. `updated_by` FK to admins added in step 24.

export const siteContent = pgTable(
  'site_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),

    value: text('value'),
    valueJson: jsonb('value_json'),

    version: integer('version').notNull().default(1),

    audience: text('audience'),

    updatedBy: uuid('updated_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('site_content_key_idx').on(t.key)],
)

// docs/03 §11 — banners.
export const banners = pgTable(
  'banners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),

    title: text('title'),
    body: text('body'),
    ctaLabel: text('cta_label'),
    ctaUrl: text('cta_url'),
    imageUrl: text('image_url'),

    audienceSegmentId: uuid('audience_segment_id').references(() => crmSegments.id),
    pages: text('pages').array(),

    startsAt: tstz('starts_at'),
    endsAt: tstz('ends_at'),

    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('active'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('banners_status_idx')
      .on(t.status, t.sortOrder)
      .where(sql`${t.status} = 'active'`),
    index('banners_schedule_idx')
      .on(t.startsAt, t.endsAt)
      .where(sql`${t.status} = 'active'`),
    check('banners_status_check', sql`${t.status} in ('active', 'inactive')`),
  ],
)

// docs/03 §11 — email_templates. `created_by` FK added in step 24.
// Self-referential FK via parent_id needs the AnyPgColumn cast.

export const emailTemplates = pgTable(
  'email_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),

    displayName: text('display_name').notNull(),

    version: integer('version').notNull().default(1),
    parentId: uuid('parent_id').references((): AnyPgColumn => emailTemplates.id),
    isCurrent: boolean('is_current').notNull().default(true),

    subjectTemplate: text('subject_template').notNull(),
    bodyHtmlTemplate: text('body_html_template').notNull(),
    bodyTextTemplate: text('body_text_template'),

    fromEmail: text('from_email'),
    replyTo: text('reply_to'),
    category: text('category'),

    createdBy: uuid('created_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('email_templates_slug_idx')
      .on(t.slug)
      .where(sql`${t.isCurrent} = true`),
  ],
)

// docs/03 §11 — sms_templates. `created_by` FK added in step 24.

export const smsTemplates = pgTable(
  'sms_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),

    displayName: text('display_name').notNull(),
    version: integer('version').notNull().default(1),
    parentId: uuid('parent_id').references((): AnyPgColumn => smsTemplates.id),
    isCurrent: boolean('is_current').notNull().default(true),

    bodyTemplate: text('body_template').notNull(),

    category: text('category'),

    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('sms_templates_body_length_check', sql`length(${t.bodyTemplate}) <= 320`)],
)

// docs/03 §11 — notifications.

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    body: text('body'),
    ctaUrl: text('cta_url'),

    category: text('category'),
    priority: text('priority').notNull().default('normal'),

    readAt: tstz('read_at'),

    sourceKind: text('source_kind'),
    sourceId: text('source_id'),

    createdAt: createdAt(),
    expiresAt: tstz('expires_at'),
  },
  (t) => [
    index('notifications_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('notifications_unread_idx')
      .on(t.playerId)
      .where(sql`${t.readAt} is null`),
    check('notifications_priority_check', sql`${t.priority} in ('low', 'normal', 'high')`),
  ],
)

// docs/09 §3.7 — versioned terms-of-service / privacy / RG policy.

export const termsVersions = pgTable(
  'terms_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    bodyHtml: text('body_html').notNull(),
    summary: text('summary'),
    effectiveAt: tstz('effective_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('terms_versions_slug_effective_idx').on(t.slug, sql`${t.effectiveAt} desc`),
    check('terms_versions_slug_check', sql`${t.slug} in ('tos', 'privacy', 'rg_policy')`),
  ],
)
