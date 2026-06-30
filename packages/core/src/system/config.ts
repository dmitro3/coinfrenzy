// docs/09 — operator-tunable runtime configuration.
//
// Replaces hardcoded safety constants (e.g. TIER_CAPS in tiers/admin.ts)
// with a master-only DB-backed read/write surface. The safety contract:
//
//   1. Caps are PERSISTED in `system_config.value` as JSONB.
//   2. Caps are READ through `getTierCaps(ctx)` which clamps every
//      value against a hardcoded HARD_TIER_CEILINGS constant. Even if
//      the row says "monthlyScMax = 999,999 SC", the returned value
//      will never exceed HARD_TIER_CEILINGS.monthlyScMax.
//   3. Caps are WRITTEN through `setTierCaps(ctx, …)` which validates
//      against HARD_TIER_CEILINGS *before* the write, AND appends an
//      audit_log entry attributing the change to the actor.
//   4. The admin route layer enforces `canEditSafetyCaps(role)` (master
//      only) on top of the RLS policy.
//
// HARD_TIER_CEILINGS is the engineering ceiling and the LAST line of
// defense. Bumping it requires a code deploy + code review, which is
// the desired property: any change that could materially expand the
// platform's bonus exposure must go through engineering.

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// -------------------------------------------------------------------------
// Hard outer ceilings — code-only, never overridable from the DB.
// -------------------------------------------------------------------------

/**
 * The MAXIMUM value the operator can ever configure through the
 * /admin/settings/safety-caps UI. Any larger value written to the
 * `system_config.tier_caps` row is silently clamped to these on read.
 *
 * These numbers are deliberately ~5× the current production defaults
 * (which themselves are already very generous). If you find yourself
 * wanting to bump these constants, STOP and have a conversation with
 * Finance / Risk first — there's a reason they're hardcoded.
 */
export const HARD_TIER_CEILINGS = {
  // 25,000 SC weekly (current default 5,000)
  weeklyScMax: 25_000n * 10_000n,
  // 100,000 SC monthly (current default 25,000)
  monthlyScMax: 100_000n * 10_000n,
  // 5× login multiplier (current default 3×)
  loginMultMax: 5.0,
  // 50% cashback (current default 25%)
  cashbackPctMax: 0.5,
} as const

// -------------------------------------------------------------------------
// Schema types
// -------------------------------------------------------------------------

export interface TierCaps {
  /** SC bigint in minor units. */
  weeklyScMax: bigint
  /** SC bigint in minor units. */
  monthlyScMax: bigint
  /** Decimal multiplier (e.g. 3.0). */
  loginMultMax: number
  /** Decimal fraction (e.g. 0.25 = 25%). */
  cashbackPctMax: number
}

export interface TierCapsInput {
  /** SC bigint in minor units. */
  weeklyScMax: bigint
  /** SC bigint in minor units. */
  monthlyScMax: bigint
  loginMultMax: number
  /** Decimal fraction (e.g. 0.25 = 25%). */
  cashbackPctMax: number
}

export type ConfigError =
  | { code: 'CEILING_EXCEEDED'; field: keyof TierCaps; max: string }
  | { code: 'INVALID'; reason: string }

// -------------------------------------------------------------------------
// Fallback defaults — used when the system_config row is missing entirely
// (fresh DB without the 0017 seed). Matches the previous in-code TIER_CAPS.
// -------------------------------------------------------------------------

const DEFAULT_TIER_CAPS: TierCaps = {
  weeklyScMax: 5_000n * 10_000n,
  monthlyScMax: 25_000n * 10_000n,
  loginMultMax: 3.0,
  cashbackPctMax: 0.25,
}

const TIER_CAPS_KEY = 'tier_caps'

// -------------------------------------------------------------------------
// Internal: clamp a raw blob against HARD_TIER_CEILINGS. Returns a fully
// typed TierCaps. Any malformed / missing field falls back to the default.
// -------------------------------------------------------------------------

function clampTierCaps(raw: unknown): TierCaps {
  const r = (raw ?? {}) as Record<string, unknown>

  const parseBigSc = (v: unknown, fallback: bigint): bigint => {
    // Stored as decimal MAJOR SC (e.g. 5000.00). Convert to minor.
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      return BigInt(Math.floor(v * 10_000))
    }
    if (typeof v === 'string') {
      const n = Number.parseFloat(v)
      if (Number.isFinite(n) && n >= 0) return BigInt(Math.floor(n * 10_000))
    }
    return fallback
  }
  const parseNum = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v))
    if (!Number.isFinite(n) || n < min) return fallback
    return Math.min(n, max)
  }

  const weeklyRaw = parseBigSc(r.weekly_sc_max ?? r.weeklyScMax, DEFAULT_TIER_CAPS.weeklyScMax)
  const monthlyRaw = parseBigSc(r.monthly_sc_max ?? r.monthlyScMax, DEFAULT_TIER_CAPS.monthlyScMax)
  const loginRaw = parseNum(
    r.login_mult_max ?? r.loginMultMax,
    DEFAULT_TIER_CAPS.loginMultMax,
    1.0,
    HARD_TIER_CEILINGS.loginMultMax,
  )
  const cashbackRaw = parseNum(
    r.cashback_pct_max ?? r.cashbackPctMax,
    DEFAULT_TIER_CAPS.cashbackPctMax * 100, // stored as percent in the JSONB
    0,
    HARD_TIER_CEILINGS.cashbackPctMax * 100,
  )

  return {
    weeklyScMax:
      weeklyRaw > HARD_TIER_CEILINGS.weeklyScMax ? HARD_TIER_CEILINGS.weeklyScMax : weeklyRaw,
    monthlyScMax:
      monthlyRaw > HARD_TIER_CEILINGS.monthlyScMax ? HARD_TIER_CEILINGS.monthlyScMax : monthlyRaw,
    loginMultMax: loginRaw,
    // Convert percent (e.g. 25) back to decimal (0.25) for callers.
    cashbackPctMax: cashbackRaw / 100,
  }
}

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

/**
 * Returns the current tier safety caps, clamped against the hard
 * engineering ceilings. Falls back to compiled-in defaults if the
 * config row is missing.
 */
export async function getTierCaps(ctx: Context): Promise<TierCaps> {
  const rows = await ctx.db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, TIER_CAPS_KEY))
    .limit(1)
  if (!rows[0]) return DEFAULT_TIER_CAPS
  return clampTierCaps(rows[0].value)
}

// -------------------------------------------------------------------------
// Writes
// -------------------------------------------------------------------------

/**
 * Persists a new tier-caps blob. Returns CEILING_EXCEEDED if any field
 * is above HARD_TIER_CEILINGS — the route layer must NOT swallow this;
 * surface the field name so the UI can highlight it.
 *
 * Caller must already have checked canEditSafetyCaps(role) before
 * invoking this; we re-validate inside the audit entry write but don't
 * try to determine role from the context here.
 */
export async function setTierCaps(
  ctx: Context,
  input: TierCapsInput,
): Promise<Result<TierCaps, ConfigError>> {
  if (input.weeklyScMax < 0n || input.monthlyScMax < 0n) {
    return err({ code: 'INVALID' as const, reason: 'sc_caps_must_be_nonneg' })
  }
  if (input.loginMultMax < 1.0) {
    return err({ code: 'INVALID' as const, reason: 'login_mult_must_be_gte_1' })
  }
  if (input.cashbackPctMax < 0) {
    return err({ code: 'INVALID' as const, reason: 'cashback_must_be_nonneg' })
  }
  if (input.weeklyScMax > HARD_TIER_CEILINGS.weeklyScMax) {
    return err({
      code: 'CEILING_EXCEEDED' as const,
      field: 'weeklyScMax',
      max: (HARD_TIER_CEILINGS.weeklyScMax / 10_000n).toString() + ' SC',
    })
  }
  if (input.monthlyScMax > HARD_TIER_CEILINGS.monthlyScMax) {
    return err({
      code: 'CEILING_EXCEEDED' as const,
      field: 'monthlyScMax',
      max: (HARD_TIER_CEILINGS.monthlyScMax / 10_000n).toString() + ' SC',
    })
  }
  if (input.loginMultMax > HARD_TIER_CEILINGS.loginMultMax) {
    return err({
      code: 'CEILING_EXCEEDED' as const,
      field: 'loginMultMax',
      max: HARD_TIER_CEILINGS.loginMultMax.toFixed(1) + '×',
    })
  }
  if (input.cashbackPctMax > HARD_TIER_CEILINGS.cashbackPctMax) {
    return err({
      code: 'CEILING_EXCEEDED' as const,
      field: 'cashbackPctMax',
      max: (HARD_TIER_CEILINGS.cashbackPctMax * 100).toFixed(0) + '%',
    })
  }

  // Read prior value for the audit diff (best-effort; missing row = null).
  const priorRows = await ctx.db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, TIER_CAPS_KEY))
    .limit(1)
  const prior = priorRows[0]?.value ?? null

  const next = {
    // Persist as decimal MAJOR SC + percent for human-readability.
    weekly_sc_max: Number(input.weeklyScMax / 10_000n),
    monthly_sc_max: Number(input.monthlyScMax / 10_000n),
    login_mult_max: input.loginMultMax,
    cashback_pct_max: input.cashbackPctMax * 100,
  }

  const actorId = ctx.actor.kind === 'admin' ? ctx.actor.adminId : null

  await ctx.db
    .insert(schema.systemConfig)
    .values({
      key: TIER_CAPS_KEY,
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
    action: 'system_config.tier_caps_updated',
    resourceKind: 'system_config',
    resourceId: TIER_CAPS_KEY,
    before: prior as Record<string, unknown> | null,
    after: next as Record<string, unknown>,
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(clampTierCaps(next))
}
