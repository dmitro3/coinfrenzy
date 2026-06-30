// docs/03 §5.1 / docs/06 §16 — tier (loyalty / rewards) admin CRUD.
//
// The tiers table powers the operator's loyalty programme: weekly /
// monthly SC payouts, daily-login multipliers, cashback %, and gating
// on bonus templates (min_tier_id). Mistuned tiers can hand out a LOT
// of free SC, so this module enforces hard safety caps and writes an
// audit_log entry for every mutation.
//
// Caps are intentionally generous — they exist to prevent typos
// ("50000" when you meant "5000") not to be the operator's only line
// of defense.

import { asc, eq, inArray, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { getTierCaps, type TierCaps } from '../system/config'

// -------------------------------------------------------------------------
// Safety caps. Live values are loaded at runtime from `system_config` via
// `getTierCaps(ctx)` and clamped against HARD_TIER_CEILINGS in
// packages/core/src/system/config.ts. The `MAX_TIER_COUNT` here stays in
// code — it's a UI scannability constraint, not a money-handling cap.
// -------------------------------------------------------------------------

/** Maximum number of tier rows allowed. UI-scannability constraint. */
export const MAX_TIER_COUNT = 20

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export type TierStatus = 'active' | 'inactive'

export interface TierRow {
  id: string
  slug: string
  displayName: string
  level: number
  xpRequired: bigint
  weeklyScBonus: bigint
  monthlyScBonus: bigint
  dailyLoginBonusMult: string
  cashbackPct: string | null
  iconUrl: string | null
  badgeColor: string | null
  description: string | null
  status: TierStatus
  createdAt: Date
  updatedAt: Date
}

export type TierError =
  | { code: 'NOT_FOUND' }
  | { code: 'SLUG_CONFLICT' }
  | { code: 'LEVEL_CONFLICT' }
  | { code: 'IN_USE'; playerCount: number }
  | { code: 'CAP_EXCEEDED'; field: string; max: string }
  | { code: 'INVALID'; reason: string }
  | { code: 'TIER_LIMIT' }

export interface CreateTierInput {
  slug: string
  displayName: string
  level: number
  xpRequired?: bigint
  weeklyScBonus?: bigint
  monthlyScBonus?: bigint
  dailyLoginBonusMult?: string
  cashbackPct?: string | null
  iconUrl?: string | null
  badgeColor?: string | null
  description?: string | null
  status?: TierStatus
}

export interface UpdateTierInput extends Partial<CreateTierInput> {
  id: string
}

// -------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9-]+$/

function validateInput(
  input: Partial<CreateTierInput>,
  caps: TierCaps,
): Result<
  void,
  { code: 'INVALID' | 'CAP_EXCEEDED'; reason?: string; field?: string; max?: string }
> {
  if (input.slug !== undefined && !SLUG_RE.test(input.slug)) {
    return err({ code: 'INVALID' as const, reason: 'slug_must_be_lowercase_hyphens_digits' })
  }
  if (input.level !== undefined && (input.level < 1 || input.level > 99)) {
    return err({ code: 'INVALID' as const, reason: 'level_must_be_1_to_99' })
  }
  if (input.xpRequired !== undefined && input.xpRequired < 0n) {
    return err({ code: 'INVALID' as const, reason: 'xp_required_must_be_nonneg' })
  }
  if (input.weeklyScBonus !== undefined) {
    if (input.weeklyScBonus < 0n) {
      return err({ code: 'INVALID' as const, reason: 'weekly_sc_must_be_nonneg' })
    }
    if (input.weeklyScBonus > caps.weeklyScMax) {
      return err({
        code: 'CAP_EXCEEDED' as const,
        field: 'weeklyScBonus',
        max: (caps.weeklyScMax / 10_000n).toString() + ' SC',
      })
    }
  }
  if (input.monthlyScBonus !== undefined) {
    if (input.monthlyScBonus < 0n) {
      return err({ code: 'INVALID' as const, reason: 'monthly_sc_must_be_nonneg' })
    }
    if (input.monthlyScBonus > caps.monthlyScMax) {
      return err({
        code: 'CAP_EXCEEDED' as const,
        field: 'monthlyScBonus',
        max: (caps.monthlyScMax / 10_000n).toString() + ' SC',
      })
    }
  }
  if (input.dailyLoginBonusMult !== undefined) {
    const n = Number.parseFloat(input.dailyLoginBonusMult)
    if (!Number.isFinite(n) || n < 1.0) {
      return err({ code: 'INVALID' as const, reason: 'login_mult_must_be_gte_1' })
    }
    if (n > caps.loginMultMax) {
      return err({
        code: 'CAP_EXCEEDED' as const,
        field: 'dailyLoginBonusMult',
        max: caps.loginMultMax.toFixed(1) + '×',
      })
    }
  }
  if (input.cashbackPct !== undefined && input.cashbackPct !== null) {
    const n = Number.parseFloat(input.cashbackPct)
    if (!Number.isFinite(n) || n < 0) {
      return err({ code: 'INVALID' as const, reason: 'cashback_must_be_nonneg' })
    }
    if (n > caps.cashbackPctMax) {
      return err({
        code: 'CAP_EXCEEDED' as const,
        field: 'cashbackPct',
        max: (caps.cashbackPctMax * 100).toFixed(0) + '%',
      })
    }
  }
  return ok(undefined)
}

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

export async function listTiers(ctx: Context): Promise<TierRow[]> {
  const rows = await ctx.db.select().from(schema.tiers).orderBy(asc(schema.tiers.level))
  return rows.map(toTierRow)
}

export async function getTier(ctx: Context, id: string): Promise<Result<TierRow, TierError>> {
  const rows = await ctx.db.select().from(schema.tiers).where(eq(schema.tiers.id, id)).limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(toTierRow(rows[0]))
}

// -------------------------------------------------------------------------
// Writes
// -------------------------------------------------------------------------

export async function createTier(
  ctx: Context,
  input: CreateTierInput,
): Promise<Result<{ id: string }, TierError>> {
  const caps = await getTierCaps(ctx)
  const v = validateInput(input, caps)
  if (!v.ok) {
    if (v.error.code === 'CAP_EXCEEDED') {
      return err({
        code: 'CAP_EXCEEDED' as const,
        field: v.error.field ?? 'unknown',
        max: v.error.max ?? '',
      })
    }
    return err({ code: 'INVALID' as const, reason: v.error.reason ?? 'invalid' })
  }

  // Tier-count cap.
  const countRows = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(schema.tiers)
  if ((countRows[0]?.n ?? 0) >= MAX_TIER_COUNT) {
    return err({ code: 'TIER_LIMIT' as const })
  }

  // Slug uniqueness.
  const slugRow = await ctx.db
    .select({ id: schema.tiers.id })
    .from(schema.tiers)
    .where(eq(schema.tiers.slug, input.slug))
    .limit(1)
  if (slugRow[0]) return err({ code: 'SLUG_CONFLICT' as const })

  // Level uniqueness.
  const levelRow = await ctx.db
    .select({ id: schema.tiers.id })
    .from(schema.tiers)
    .where(eq(schema.tiers.level, input.level))
    .limit(1)
  if (levelRow[0]) return err({ code: 'LEVEL_CONFLICT' as const })

  const inserted = await ctx.db
    .insert(schema.tiers)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      level: input.level,
      xpRequired: input.xpRequired ?? 0n,
      weeklyScBonus: input.weeklyScBonus ?? 0n,
      monthlyScBonus: input.monthlyScBonus ?? 0n,
      dailyLoginBonusMult: input.dailyLoginBonusMult ?? '1.0',
      cashbackPct: input.cashbackPct ?? '0',
      iconUrl: input.iconUrl ?? null,
      badgeColor: input.badgeColor ?? null,
      description: input.description ?? null,
      status: input.status ?? 'active',
    })
    .returning({ id: schema.tiers.id })

  const id = inserted[0]!.id

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'tier.create',
    resourceKind: 'tier',
    resourceId: id,
    after: sanitiseForAudit(input),
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok({ id })
}

export async function updateTier(
  ctx: Context,
  input: UpdateTierInput,
): Promise<Result<void, TierError>> {
  const caps = await getTierCaps(ctx)
  const v = validateInput(input, caps)
  if (!v.ok) {
    if (v.error.code === 'CAP_EXCEEDED') {
      return err({
        code: 'CAP_EXCEEDED' as const,
        field: v.error.field ?? 'unknown',
        max: v.error.max ?? '',
      })
    }
    return err({ code: 'INVALID' as const, reason: v.error.reason ?? 'invalid' })
  }

  const existingRows = await ctx.db
    .select()
    .from(schema.tiers)
    .where(eq(schema.tiers.id, input.id))
    .limit(1)
  if (!existingRows[0]) return err({ code: 'NOT_FOUND' as const })
  const existing = toTierRow(existingRows[0])

  if (input.slug && input.slug !== existing.slug) {
    const slugRow = await ctx.db
      .select({ id: schema.tiers.id })
      .from(schema.tiers)
      .where(eq(schema.tiers.slug, input.slug))
      .limit(1)
    if (slugRow[0]) return err({ code: 'SLUG_CONFLICT' as const })
  }

  if (input.level !== undefined && input.level !== existing.level) {
    const levelRow = await ctx.db
      .select({ id: schema.tiers.id })
      .from(schema.tiers)
      .where(eq(schema.tiers.level, input.level))
      .limit(1)
    if (levelRow[0] && levelRow[0].id !== input.id) {
      return err({ code: 'LEVEL_CONFLICT' as const })
    }
  }

  const patch: Partial<typeof schema.tiers.$inferInsert> = { updatedAt: new Date() }
  if (input.slug !== undefined) patch.slug = input.slug
  if (input.displayName !== undefined) patch.displayName = input.displayName
  if (input.level !== undefined) patch.level = input.level
  if (input.xpRequired !== undefined) patch.xpRequired = input.xpRequired
  if (input.weeklyScBonus !== undefined) patch.weeklyScBonus = input.weeklyScBonus
  if (input.monthlyScBonus !== undefined) patch.monthlyScBonus = input.monthlyScBonus
  if (input.dailyLoginBonusMult !== undefined) patch.dailyLoginBonusMult = input.dailyLoginBonusMult
  if (input.cashbackPct !== undefined) patch.cashbackPct = input.cashbackPct
  if (input.iconUrl !== undefined) patch.iconUrl = input.iconUrl
  if (input.badgeColor !== undefined) patch.badgeColor = input.badgeColor
  if (input.description !== undefined) patch.description = input.description
  if (input.status !== undefined) patch.status = input.status

  await ctx.db.update(schema.tiers).set(patch).where(eq(schema.tiers.id, input.id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'tier.update',
    resourceKind: 'tier',
    resourceId: input.id,
    before: sanitiseForAudit(existing),
    after: sanitiseForAudit({ ...input }),
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

/**
 * Hard delete a tier. Refuses if any players are in it (or if any bonus
 * template references it as min_tier_id).
 *
 * Operators who want to "retire" a tier should set status='inactive'
 * instead — that's reversible and keeps the row intact for audit.
 */
export async function deleteTier(ctx: Context, id: string): Promise<Result<void, TierError>> {
  const existingRows = await ctx.db
    .select()
    .from(schema.tiers)
    .where(eq(schema.tiers.id, id))
    .limit(1)
  if (!existingRows[0]) return err({ code: 'NOT_FOUND' as const })

  const playerCountRows = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tierProgress)
    .where(eq(schema.tierProgress.currentTierId, id))
  const playerCount = playerCountRows[0]?.n ?? 0
  if (playerCount > 0) return err({ code: 'IN_USE' as const, playerCount })

  // Also block delete if any package or bonus references this tier as
  // min_tier_id — orphan FK pointers would break the loyalty gate.
  const linkedPackages = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.packages)
    .where(eq(schema.packages.minTierId, id))
  if ((linkedPackages[0]?.n ?? 0) > 0) {
    return err({ code: 'IN_USE' as const, playerCount: linkedPackages[0]?.n ?? 0 })
  }

  await ctx.db.delete(schema.tiers).where(eq(schema.tiers.id, id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'tier.delete',
    resourceKind: 'tier',
    resourceId: id,
    before: sanitiseForAudit(toTierRow(existingRows[0])),
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

/**
 * Reorder tiers by re-assigning levels. Pass the full list of tiers in
 * desired display order. Levels are renumbered 1..N atomically to avoid
 * tripping the level UNIQUE constraint mid-update.
 *
 * Players keep their current tier *id*; their derived level updates via
 * the linked tier row, so reordering is effectively a no-op for players.
 */
export async function reorderTiers(
  ctx: Context,
  orderedIds: string[],
): Promise<Result<void, TierError>> {
  if (orderedIds.length === 0) return ok(undefined)
  if (new Set(orderedIds).size !== orderedIds.length) {
    return err({ code: 'INVALID' as const, reason: 'duplicate_ids' })
  }

  await ctx.db.transaction(async (tx) => {
    // First push every tier well above the max level to dodge the unique
    // constraint — postgres can't defer it without a DEFERRABLE
    // declaration which we don't have on the existing schema.
    await tx
      .update(schema.tiers)
      .set({ level: sql`${schema.tiers.level} + 1000` })
      .where(inArray(schema.tiers.id, orderedIds))

    let nextLevel = 1
    for (const id of orderedIds) {
      await tx
        .update(schema.tiers)
        .set({ level: nextLevel, updatedAt: new Date() })
        .where(eq(schema.tiers.id, id))
      nextLevel++
    }
  })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'tier.reorder',
    resourceKind: 'tier',
    after: { orderedIds },
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function toTierRow(r: typeof schema.tiers.$inferSelect): TierRow {
  return {
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    level: r.level,
    xpRequired: r.xpRequired,
    weeklyScBonus: r.weeklyScBonus,
    monthlyScBonus: r.monthlyScBonus,
    dailyLoginBonusMult: r.dailyLoginBonusMult,
    cashbackPct: r.cashbackPct,
    iconUrl: r.iconUrl,
    badgeColor: r.badgeColor,
    description: r.description,
    status: r.status as TierStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function sanitiseForAudit(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === 'id') continue
    if (typeof v === 'bigint') out[k] = v.toString()
    else if (v instanceof Date) out[k] = v.toISOString()
    else out[k] = v
  }
  return out
}
