import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt, emptyJsonbDefault, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §9.1 — crm_segments. `created_by` FK added in step 24.

export const crmSegments = pgTable(
  'crm_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    description: text('description'),

    filterTree: jsonb('filter_tree').notNull(),

    compiledSql: text('compiled_sql'),
    compiledAt: tstz('compiled_at'),
    compilationVersion: integer('compilation_version').default(1),

    cachedCount: integer('cached_count'),
    countUpdatedAt: tstz('count_updated_at'),

    status: text('status').notNull().default('active'),

    createdBy: uuid('created_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('crm_segments_status_idx').on(t.status, t.name),
    check('crm_segments_status_check', sql`${t.status} in ('active', 'archived')`),
  ],
)

// docs/03 §9.2 — crm_campaigns. `created_by` FK added in step 24.

export const crmCampaigns = pgTable(
  'crm_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),

    segmentId: uuid('segment_id').references(() => crmSegments.id),

    channel: text('channel').notNull(),

    templateId: uuid('template_id'),

    abVariantATemplateId: uuid('ab_variant_a_template_id'),
    abVariantBTemplateId: uuid('ab_variant_b_template_id'),
    abSplitPct: integer('ab_split_pct'),
    abWinnerMetric: text('ab_winner_metric'),
    abWinningVariant: text('ab_winning_variant'),
    abDecidedAt: tstz('ab_decided_at'),

    scheduledFor: tstz('scheduled_for'),

    conversionEvent: text('conversion_event'),
    conversionWindowHours: integer('conversion_window_hours').default(168),

    status: text('status').notNull().default('draft'),

    segmentSnapshotCount: integer('segment_snapshot_count'),
    eligibleCount: integer('eligible_count'),
    recipientsCount: integer('recipients_count').default(0),
    sentCount: integer('sent_count').default(0),
    deliveredCount: integer('delivered_count').default(0),
    openedCount: integer('opened_count').default(0),
    clickedCount: integer('clicked_count').default(0),
    bouncedCount: integer('bounced_count').default(0),
    unsubscribedCount: integer('unsubscribed_count').default(0),
    conversionCount: integer('conversion_count').default(0),

    createdBy: uuid('created_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    sentStartedAt: tstz('sent_started_at'),
    sentCompletedAt: tstz('sent_completed_at'),
  },
  (t) => [
    index('crm_campaigns_status_idx').on(t.status, sql`${t.createdAt} desc`),
    index('crm_campaigns_segment_idx').on(t.segmentId),
    index('crm_campaigns_scheduled_idx')
      .on(t.scheduledFor)
      .where(sql`${t.status} = 'scheduled'`),
    check('crm_campaigns_channel_check', sql`${t.channel} in ('email', 'sms', 'in_app')`),
    check(
      'crm_campaigns_status_check',
      sql`${t.status} in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'paused')`,
    ),
  ],
)

// docs/03 §9.3 — crm_flows. `created_by` FK added in step 24.

export const crmFlows = pgTable(
  'crm_flows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),

    triggerEvent: text('trigger_event').notNull(),
    triggerFilter: jsonb('trigger_filter'),

    maxEnrollmentsPerPlayer: integer('max_enrollments_per_player').default(1),
    cooldownHoursBetweenEnrollments: integer('cooldown_hours_between_enrollments'),

    status: text('status').notNull().default('active'),

    conversionEvent: text('conversion_event'),

    enrollmentsCountLifetime: integer('enrollments_count_lifetime').notNull().default(0),

    createdBy: uuid('created_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('crm_flows_trigger_idx')
      .on(t.triggerEvent, t.status)
      .where(sql`${t.status} = 'active'`),
    check('crm_flows_status_check', sql`${t.status} in ('active', 'paused', 'archived')`),
  ],
)

export const crmFlowSteps = pgTable(
  'crm_flow_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => crmFlows.id, { onDelete: 'cascade' }),

    stepNumber: integer('step_number').notNull(),

    actionType: text('action_type').notNull(),

    config: jsonb('config').notNull().default(emptyJsonbDefault),

    waitDurationSeconds: integer('wait_duration_seconds'),

    createdAt: createdAt(),
  },
  (t) => [
    unique('crm_flow_steps_flow_step_unique').on(t.flowId, t.stepNumber),
    index('crm_flow_steps_flow_idx').on(t.flowId, t.stepNumber),
    check(
      'crm_flow_steps_action_check',
      sql`${t.actionType} in ('send_email', 'send_sms', 'wait', 'condition', 'award_bonus', 'add_to_segment', 'remove_from_segment', 'end')`,
    ),
  ],
)

export const crmFlowEnrollments = pgTable(
  'crm_flow_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => crmFlows.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    currentStep: integer('current_step').notNull().default(1),
    nextActionAt: tstz('next_action_at').notNull().defaultNow(),

    status: text('status').notNull().default('active'),

    enrolledAt: tstz('enrolled_at').notNull().defaultNow(),
    completedAt: tstz('completed_at'),
    lastStepAt: tstz('last_step_at'),
    errorMessage: text('error_message'),
  },
  (t) => [
    index('crm_flow_enrollments_player_idx').on(t.playerId, t.flowId),
    index('crm_flow_enrollments_pending_idx')
      .on(t.nextActionAt)
      .where(sql`${t.status} = 'active'`),
    check(
      'crm_flow_enrollments_status_check',
      sql`${t.status} in ('active', 'completed', 'cancelled', 'errored')`,
    ),
  ],
)

// docs/03 §9.4 — crm_message_log. Partitioned by month on created_at.
export const crmMessageLog = pgTable(
  'crm_message_log',
  {
    id: uuid('id').notNull().defaultRandom(),
    playerId: uuid('player_id').notNull(),

    campaignId: uuid('campaign_id'),
    flowEnrollmentId: uuid('flow_enrollment_id'),
    templateId: uuid('template_id'),

    channel: text('channel').notNull(),
    recipient: text('recipient').notNull(),

    subject: text('subject'),
    bodyPreview: text('body_preview'),
    /**
     * R2 object key (e.g. `email-bodies/2026/05/19/<messageId>.html`)
     * for the full HTML body. Detail dialog fetches via signed URL.
     * Null for legacy rows or messages where we never persisted the
     * full body (e.g. SMS / push).
     */
    bodyStorageKey: text('body_storage_key'),
    abVariant: text('ab_variant'),

    status: text('status').notNull(),

    sendgridMessageId: text('sendgrid_message_id'),
    twilioMessageSid: text('twilio_message_sid'),

    conversionEventId: uuid('conversion_event_id'),
    conversionAt: tstz('conversion_at'),

    queuedAt: tstz('queued_at'),
    sentAt: tstz('sent_at'),
    deliveredAt: tstz('delivered_at'),
    openedAt: tstz('opened_at'),
    clickedAt: tstz('clicked_at'),

    errorCode: text('error_code'),
    errorMessage: text('error_message'),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    index('crm_message_log_player_idx').on(t.playerId, sql`${t.createdAt} desc`),
    index('crm_message_log_campaign_idx').on(t.campaignId, sql`${t.createdAt} desc`),
    index('crm_message_log_status_idx').on(t.status, sql`${t.createdAt} desc`),
    check('crm_message_log_channel_check', sql`${t.channel} in ('email', 'sms', 'in_app')`),
    check(
      'crm_message_log_status_check',
      sql`${t.status} in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed', 'failed')`,
    ),
  ],
)

// docs/03 §9.5 — crm_suppression.
export const crmSuppression = pgTable(
  'crm_suppression',
  {
    emailOrPhone: text('email_or_phone').primaryKey(),
    reason: text('reason').notNull(),
    source: text('source').notNull(),
    addedAt: tstz('added_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'crm_suppression_source_check',
      sql`${t.source} in ('bounce', 'complaint', 'manual', 'unsubscribe', 'tcpa_stop')`,
    ),
  ],
)
