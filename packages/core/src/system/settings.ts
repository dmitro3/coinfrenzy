// docs/09 — operator-tunable runtime settings backed by `system_config`.
//
// This module exposes one typed get/set pair per key. Each setter:
//   1. Validates against a Zod schema (shape + range).
//   2. Reads the prior row for an audit diff.
//   3. Writes the new value via UPSERT.
//   4. Appends an `audit_log` row attributing the change.
//
// All money in JSONB is persisted in MAJOR USD (decimal) for human
// readability, mirroring how `tier_caps` persists weekly_sc_max as 5000
// rather than 50000000. Callers receive the same MAJOR units; only at
// the very last enforcement step do we convert to minor bigints.
//
// SAFETY: every key has a HARD CEILING constant (e.g.
// HARD_RG_CEILINGS, HARD_REDEMPTION_CEILINGS). Any larger value
// submitted from the UI is rejected before the write. The hard
// ceilings are deliberately wide — they're the engineering "last line
// of defense" against misconfiguration, not the operator's day-to-day
// upper bound.

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// -------------------------------------------------------------------------
// Hard outer ceilings — code-only, never overridable from the DB.
// -------------------------------------------------------------------------

export const HARD_RG_CEILINGS = {
  /** $100,000 / day */
  dailyPurchaseLimitUsdMax: 100_000,
  /** $500,000 / week */
  weeklyPurchaseLimitUsdMax: 500_000,
  /** $1,500,000 / month */
  monthlyPurchaseLimitUsdMax: 1_500_000,
  /** 12 hours */
  sessionLengthMinutesMax: 12 * 60,
  /** 1 year */
  coolingOffHoursMax: 24 * 365,
} as const

export const HARD_REDEMPTION_CEILINGS = {
  /** $50,000 single redemption ceiling */
  maxRedemptionUsdMax: 50_000,
  /** $100,000 / day across all players */
  dailyRedemptionCapUsdMax: 100_000,
  /** $1,000 — anything higher should require human review by policy */
  autoApprovalThresholdUsdMax: 1_000,
} as const

export const HARD_BONUS_CEILINGS = {
  /** 100× playthrough — beyond this the bonus is functionally non-redeemable */
  defaultPlaythroughMultiplierMax: 100,
  /** 1 year window */
  defaultPlaythroughWindowHoursMax: 24 * 365,
  /** 1 year expiry */
  defaultExpiryDaysMax: 365,
} as const

// -------------------------------------------------------------------------
// Schemas (input + persisted shapes)
// -------------------------------------------------------------------------

// snake_case keys mirror the JSONB column.
const generalRowSchema = z.object({
  platform_name: z.string().min(1).max(80),
  support_email: z.string().email().max(254),
  support_hours: z.string().min(1).max(80),
  social_twitter: z.string().max(80).nullable().optional().default(null),
  social_instagram: z.string().max(80).nullable().optional().default(null),
  social_facebook: z.string().max(80).nullable().optional().default(null),
})

const rgDefaultsRowSchema = z.object({
  daily_purchase_limit_usd: z.number().nonnegative().max(HARD_RG_CEILINGS.dailyPurchaseLimitUsdMax),
  weekly_purchase_limit_usd: z
    .number()
    .nonnegative()
    .max(HARD_RG_CEILINGS.weeklyPurchaseLimitUsdMax),
  monthly_purchase_limit_usd: z
    .number()
    .nonnegative()
    .max(HARD_RG_CEILINGS.monthlyPurchaseLimitUsdMax),
  session_length_minutes: z.number().int().positive().max(HARD_RG_CEILINGS.sessionLengthMinutesMax),
  cooling_off_hours: z.number().int().positive().max(HARD_RG_CEILINGS.coolingOffHoursMax),
})

const bonusDefaultsRowSchema = z.object({
  default_playthrough_multiplier: z
    .number()
    .nonnegative()
    .max(HARD_BONUS_CEILINGS.defaultPlaythroughMultiplierMax),
  default_playthrough_window_hours: z
    .number()
    .int()
    .positive()
    .max(HARD_BONUS_CEILINGS.defaultPlaythroughWindowHoursMax),
  default_expiry_days: z.number().int().positive().max(HARD_BONUS_CEILINGS.defaultExpiryDaysMax),
  stacking_enabled: z.boolean(),
})

const redemptionCapsRowSchema = z
  .object({
    min_redemption_usd: z.number().nonnegative(),
    max_redemption_usd: z.number().positive().max(HARD_REDEMPTION_CEILINGS.maxRedemptionUsdMax),
    daily_redemption_cap_usd: z
      .number()
      .nonnegative()
      .max(HARD_REDEMPTION_CEILINGS.dailyRedemptionCapUsdMax),
    auto_approval_threshold_usd: z
      .number()
      .nonnegative()
      .max(HARD_REDEMPTION_CEILINGS.autoApprovalThresholdUsdMax),
  })
  .refine((v) => v.max_redemption_usd >= v.min_redemption_usd, {
    message: 'max_redemption_usd must be >= min_redemption_usd',
    path: ['max_redemption_usd'],
  })

// -------------------------------------------------------------------------
// Camel-cased view types — what callers actually consume.
// -------------------------------------------------------------------------

export interface GeneralSettings {
  platformName: string
  supportEmail: string
  supportHours: string
  socialTwitter: string | null
  socialInstagram: string | null
  socialFacebook: string | null
}

export interface RgDefaults {
  dailyPurchaseLimitUsd: number
  weeklyPurchaseLimitUsd: number
  monthlyPurchaseLimitUsd: number
  sessionLengthMinutes: number
  coolingOffHours: number
}

export interface BonusDefaults {
  defaultPlaythroughMultiplier: number
  defaultPlaythroughWindowHours: number
  defaultExpiryDays: number
  stackingEnabled: boolean
}

export interface RedemptionCaps {
  minRedemptionUsd: number
  maxRedemptionUsd: number
  dailyRedemptionCapUsd: number
  autoApprovalThresholdUsd: number
}

// -------------------------------------------------------------------------
// Defaults — used when a row is missing entirely (fresh DB without seed).
// -------------------------------------------------------------------------

const DEFAULT_GENERAL: GeneralSettings = {
  platformName: 'CoinFrenzy',
  supportEmail: 'support@coinfrenzy.casino',
  supportHours: '24/7',
  socialTwitter: null,
  socialInstagram: null,
  socialFacebook: null,
}

const DEFAULT_RG: RgDefaults = {
  dailyPurchaseLimitUsd: 1_000,
  weeklyPurchaseLimitUsd: 5_000,
  monthlyPurchaseLimitUsd: 15_000,
  sessionLengthMinutes: 180,
  coolingOffHours: 24,
}

const DEFAULT_BONUS: BonusDefaults = {
  defaultPlaythroughMultiplier: 1.0,
  defaultPlaythroughWindowHours: 168,
  defaultExpiryDays: 30,
  stackingEnabled: false,
}

const DEFAULT_REDEMPTION: RedemptionCaps = {
  minRedemptionUsd: 50,
  maxRedemptionUsd: 5_000,
  dailyRedemptionCapUsd: 2_500,
  autoApprovalThresholdUsd: 50,
}

// -------------------------------------------------------------------------
// Generic helpers
// -------------------------------------------------------------------------

export type SettingsError =
  | { code: 'VALIDATION'; issues: z.ZodIssue[] }
  | { code: 'INVALID'; reason: string }

async function loadRow(ctx: Context, key: string): Promise<unknown | null> {
  const rows = await ctx.db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, key))
    .limit(1)
  return rows[0]?.value ?? null
}

async function persist(
  ctx: Context,
  key: string,
  next: Record<string, unknown>,
  prior: unknown,
  auditAction: string,
): Promise<void> {
  const actorId = ctx.actor.kind === 'admin' ? ctx.actor.adminId : null
  await ctx.db
    .insert(schema.systemConfig)
    .values({
      key,
      value: next,
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: {
        value: next,
        updatedBy: actorId,
        updatedAt: new Date(),
      },
    })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: auditAction,
    resourceKind: 'system_config',
    resourceId: key,
    before: (prior as Record<string, unknown> | null) ?? null,
    after: next,
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })
}

// -------------------------------------------------------------------------
// general
// -------------------------------------------------------------------------

export async function getGeneralSettings(ctx: Context): Promise<GeneralSettings> {
  const raw = await loadRow(ctx, 'general')
  if (!raw) return DEFAULT_GENERAL
  const parsed = generalRowSchema.safeParse(raw)
  if (!parsed.success) return DEFAULT_GENERAL
  return {
    platformName: parsed.data.platform_name,
    supportEmail: parsed.data.support_email,
    supportHours: parsed.data.support_hours,
    socialTwitter: parsed.data.social_twitter ?? null,
    socialInstagram: parsed.data.social_instagram ?? null,
    socialFacebook: parsed.data.social_facebook ?? null,
  }
}

export async function setGeneralSettings(
  ctx: Context,
  input: GeneralSettings,
): Promise<Result<GeneralSettings, SettingsError>> {
  const next = {
    platform_name: input.platformName,
    support_email: input.supportEmail,
    support_hours: input.supportHours,
    social_twitter: input.socialTwitter,
    social_instagram: input.socialInstagram,
    social_facebook: input.socialFacebook,
  }
  const parsed = generalRowSchema.safeParse(next)
  if (!parsed.success) return err({ code: 'VALIDATION' as const, issues: parsed.error.issues })

  const prior = await loadRow(ctx, 'general')
  await persist(ctx, 'general', next, prior, 'system_config.general_updated')
  return ok(input)
}

// -------------------------------------------------------------------------
// rg_defaults
// -------------------------------------------------------------------------

export async function getRgDefaults(ctx: Context): Promise<RgDefaults> {
  const raw = await loadRow(ctx, 'rg_defaults')
  if (!raw) return DEFAULT_RG
  const parsed = rgDefaultsRowSchema.safeParse(raw)
  if (!parsed.success) return DEFAULT_RG
  return {
    dailyPurchaseLimitUsd: parsed.data.daily_purchase_limit_usd,
    weeklyPurchaseLimitUsd: parsed.data.weekly_purchase_limit_usd,
    monthlyPurchaseLimitUsd: parsed.data.monthly_purchase_limit_usd,
    sessionLengthMinutes: parsed.data.session_length_minutes,
    coolingOffHours: parsed.data.cooling_off_hours,
  }
}

export async function setRgDefaults(
  ctx: Context,
  input: RgDefaults,
): Promise<Result<RgDefaults, SettingsError>> {
  if (input.weeklyPurchaseLimitUsd < input.dailyPurchaseLimitUsd) {
    return err({ code: 'INVALID' as const, reason: 'weekly_must_gte_daily' })
  }
  if (input.monthlyPurchaseLimitUsd < input.weeklyPurchaseLimitUsd) {
    return err({ code: 'INVALID' as const, reason: 'monthly_must_gte_weekly' })
  }
  const next = {
    daily_purchase_limit_usd: input.dailyPurchaseLimitUsd,
    weekly_purchase_limit_usd: input.weeklyPurchaseLimitUsd,
    monthly_purchase_limit_usd: input.monthlyPurchaseLimitUsd,
    session_length_minutes: input.sessionLengthMinutes,
    cooling_off_hours: input.coolingOffHours,
  }
  const parsed = rgDefaultsRowSchema.safeParse(next)
  if (!parsed.success) return err({ code: 'VALIDATION' as const, issues: parsed.error.issues })

  const prior = await loadRow(ctx, 'rg_defaults')
  await persist(ctx, 'rg_defaults', next, prior, 'system_config.rg_defaults_updated')
  return ok(input)
}

// -------------------------------------------------------------------------
// bonus_defaults
// -------------------------------------------------------------------------

export async function getBonusDefaults(ctx: Context): Promise<BonusDefaults> {
  const raw = await loadRow(ctx, 'bonus_defaults')
  if (!raw) return DEFAULT_BONUS
  const parsed = bonusDefaultsRowSchema.safeParse(raw)
  if (!parsed.success) return DEFAULT_BONUS
  return {
    defaultPlaythroughMultiplier: parsed.data.default_playthrough_multiplier,
    defaultPlaythroughWindowHours: parsed.data.default_playthrough_window_hours,
    defaultExpiryDays: parsed.data.default_expiry_days,
    stackingEnabled: parsed.data.stacking_enabled,
  }
}

export async function setBonusDefaults(
  ctx: Context,
  input: BonusDefaults,
): Promise<Result<BonusDefaults, SettingsError>> {
  const next = {
    default_playthrough_multiplier: input.defaultPlaythroughMultiplier,
    default_playthrough_window_hours: input.defaultPlaythroughWindowHours,
    default_expiry_days: input.defaultExpiryDays,
    stacking_enabled: input.stackingEnabled,
  }
  const parsed = bonusDefaultsRowSchema.safeParse(next)
  if (!parsed.success) return err({ code: 'VALIDATION' as const, issues: parsed.error.issues })

  const prior = await loadRow(ctx, 'bonus_defaults')
  await persist(ctx, 'bonus_defaults', next, prior, 'system_config.bonus_defaults_updated')
  return ok(input)
}

// -------------------------------------------------------------------------
// redemption_caps
// -------------------------------------------------------------------------

export async function getRedemptionCaps(ctx: Context): Promise<RedemptionCaps> {
  const raw = await loadRow(ctx, 'redemption_caps')
  if (!raw) return DEFAULT_REDEMPTION
  const parsed = redemptionCapsRowSchema.safeParse(raw)
  if (!parsed.success) return DEFAULT_REDEMPTION
  return {
    minRedemptionUsd: parsed.data.min_redemption_usd,
    maxRedemptionUsd: parsed.data.max_redemption_usd,
    dailyRedemptionCapUsd: parsed.data.daily_redemption_cap_usd,
    autoApprovalThresholdUsd: parsed.data.auto_approval_threshold_usd,
  }
}

export async function setRedemptionCaps(
  ctx: Context,
  input: RedemptionCaps,
): Promise<Result<RedemptionCaps, SettingsError>> {
  const next = {
    min_redemption_usd: input.minRedemptionUsd,
    max_redemption_usd: input.maxRedemptionUsd,
    daily_redemption_cap_usd: input.dailyRedemptionCapUsd,
    auto_approval_threshold_usd: input.autoApprovalThresholdUsd,
  }
  const parsed = redemptionCapsRowSchema.safeParse(next)
  if (!parsed.success) return err({ code: 'VALIDATION' as const, issues: parsed.error.issues })

  const prior = await loadRow(ctx, 'redemption_caps')
  await persist(ctx, 'redemption_caps', next, prior, 'system_config.redemption_caps_updated')
  return ok(input)
}
