import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  createdAt,
  deletedAt,
  emptyJsonbDefault,
  money,
  playerStatus,
  tstz,
  updatedAt,
} from './_shared'

// docs/03 §2.1 — players.
// `attributed_affiliate_id` FK is added in the cross-FK migration (step 24).

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    email: text('email').notNull().unique(),
    username: text('username').unique(),
    displayName: text('display_name'),
    phone: text('phone'),
    dateOfBirth: date('date_of_birth'),
    firstName: text('first_name'),
    lastName: text('last_name'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('US'),

    status: playerStatus('status').notNull().default('active'),
    statusReason: text('status_reason'),
    isInternalAccount: boolean('is_internal_account').notNull().default(false),

    kycLevel: integer('kyc_level').notNull().default(0),
    kycVerifiedAt: tstz('kyc_verified_at'),

    firstSeenAt: tstz('first_seen_at').notNull().defaultNow(),
    lastSeenAt: tstz('last_seen_at'),
    lastLoginAt: tstz('last_login_at'),
    signupIp: inet('signup_ip'),
    signupCountry: text('signup_country'),
    signupState: text('signup_state'),

    attributedAffiliateId: uuid('attributed_affiliate_id'),
    attributedPromoCode: text('attributed_promo_code'),
    attributedAt: tstz('attributed_at'),

    rgSelfExcludedUntil: tstz('rg_self_excluded_until'),
    rgDepositLimitDaily: money('rg_deposit_limit_daily'),
    rgDepositLimitWeekly: money('rg_deposit_limit_weekly'),
    rgDepositLimitMonthly: money('rg_deposit_limit_monthly'),
    rgSessionLimitMin: integer('rg_session_limit_min'),
    rgPendingLimitChanges: jsonb('rg_pending_limit_changes'),

    emailConsent: boolean('email_consent').notNull().default(true),
    smsConsent: boolean('sms_consent').notNull().default(false),
    marketingConsentAt: tstz('marketing_consent_at'),

    tosAcceptedVersion: integer('tos_accepted_version'),
    tosAcceptedAt: tstz('tos_accepted_at'),
    privacyAcceptedVersion: integer('privacy_accepted_version'),
    privacyAcceptedAt: tstz('privacy_accepted_at'),
    crmDailyMax: integer('crm_daily_max').notNull().default(3),

    gammaUserId: text('gamma_user_id').unique(),

    signupSource: text('signup_source'),
    metadata: jsonb('metadata').notNull().default(emptyJsonbDefault),

    // VIP / Host system (docs M4). `assigned_host_id` FK is declared in the
    // 0010 migration to avoid an ordering loop with admins.
    vipStatus: text('vip_status').notNull().default('none'),
    vipQualifiedAt: tstz('vip_qualified_at'),
    assignedHostId: uuid('assigned_host_id'),
    hostAssignedAt: tstz('host_assigned_at'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('players_email_idx').on(sql`lower(${t.email})`),
    index('players_username_idx')
      .on(sql`lower(${t.username})`)
      .where(sql`${t.username} is not null`),
    index('players_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} is null`),
    index('players_kyc_level_idx').on(t.kycLevel),
    index('players_attributed_affiliate_idx')
      .on(t.attributedAffiliateId)
      .where(sql`${t.attributedAffiliateId} is not null`),
    index('players_last_seen_idx')
      .on(sql`${t.lastSeenAt} desc`)
      .where(sql`${t.deletedAt} is null`),
    index('players_last_login_idx')
      .on(sql`${t.lastLoginAt} desc`)
      .where(sql`${t.deletedAt} is null`),
    index('players_state_idx').on(t.state, t.status),
    index('players_gamma_id_idx')
      .on(t.gammaUserId)
      .where(sql`${t.gammaUserId} is not null`),
    index('players_real_users_idx')
      .on(t.id)
      .where(sql`${t.isInternalAccount} = false and ${t.deletedAt} is null`),
    index('players_phone_idx')
      .on(t.phone)
      .where(sql`${t.phone} is not null`),
    index('players_vip_status_idx')
      .on(t.vipStatus)
      .where(sql`${t.vipStatus} <> 'none' and ${t.deletedAt} is null`),
    index('players_assigned_host_idx')
      .on(t.assignedHostId)
      .where(sql`${t.assignedHostId} is not null and ${t.deletedAt} is null`),
    check('players_kyc_level_range', sql`${t.kycLevel} >= 0 and ${t.kycLevel} <= 3`),
    check(
      'players_vip_status_check',
      sql`${t.vipStatus} in ('none', 'candidate', 'vip', 'high_roller')`,
    ),
  ],
)

// docs/03 §2.2 — wallets.

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull(),

    currentBalance: money('current_balance')
      .notNull()
      .default(sql`0`),

    balancePurchased: money('balance_purchased')
      .notNull()
      .default(sql`0`),
    balanceBonus: money('balance_bonus')
      .notNull()
      .default(sql`0`),
    balancePromo: money('balance_promo')
      .notNull()
      .default(sql`0`),
    balanceEarned: money('balance_earned')
      .notNull()
      .default(sql`0`),

    playthroughRequired: money('playthrough_required')
      .notNull()
      .default(sql`0`),
    playthroughProgress: money('playthrough_progress')
      .notNull()
      .default(sql`0`),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('wallets_player_currency_unique').on(t.playerId, t.currency),
    index('wallets_player_idx').on(t.playerId),
    check('wallets_currency_check', sql`${t.currency} in ('GC', 'SC')`),
    check(
      'wallets_balance_sum_check',
      sql`${t.currentBalance} = ${t.balancePurchased} + ${t.balanceBonus} + ${t.balancePromo} + ${t.balanceEarned}`,
    ),
  ],
)
