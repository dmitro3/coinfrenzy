import { and, asc, eq, isNull } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// docs/07 §5.1 — operator-tunable auto-approval rules.
//
// This module owns reads, writes, and the matcher for the
// `redemption_rules` table. The matcher is intentionally tiny: it walks
// rules in priority order and returns the first match. No expression
// engine, no caching layer — rule sets are small (single-digit rows in
// practice) and the read is one indexed lookup. If volume ever grows
// we can drop a 60s LRU in front of `listActiveRules`, but right now it
// would just be premature.

export type RedemptionRuleAction = 'auto_approve' | 'route_to_review'

export interface RedemptionRule {
  id: string
  title: string
  description: string | null
  priority: number
  isActive: boolean
  action: RedemptionRuleAction
  maxAmountUsd: bigint | null
  minAmountUsd: bigint | null
  requiredKycLevels: number[]
  blockedStates: string[]
  requirePriorPaidRedemption: boolean
  completionHours: number
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
}

export interface RedemptionEvaluationContext {
  amountUsd: bigint
  kycLevel: number
  state: string | null
  priorPaidRedemptionCount: number
}

export interface RuleEvaluation {
  matchedRule: RedemptionRule | null
  action: RedemptionRuleAction | 'pending_review'
}

function rowToRule(row: typeof schema.redemptionRules.$inferSelect): RedemptionRule {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    isActive: row.isActive,
    action: row.action as RedemptionRuleAction,
    maxAmountUsd: row.maxAmountUsd,
    minAmountUsd: row.minAmountUsd,
    requiredKycLevels: Array.isArray(row.requiredKycLevels)
      ? (row.requiredKycLevels as number[])
      : [],
    blockedStates: Array.isArray(row.blockedStates) ? (row.blockedStates as string[]) : [],
    requirePriorPaidRedemption: row.requirePriorPaidRedemption,
    completionHours: row.completionHours,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  }
}

export async function listRedemptionRules(
  ctx: Context,
  options: { includeArchived?: boolean } = {},
): Promise<RedemptionRule[]> {
  const rows = await ctx.db
    .select()
    .from(schema.redemptionRules)
    .where(options.includeArchived ? undefined : isNull(schema.redemptionRules.archivedAt))
    .orderBy(asc(schema.redemptionRules.priority), asc(schema.redemptionRules.createdAt))
  return rows.map(rowToRule)
}

export async function listActiveRedemptionRules(ctx: Context): Promise<RedemptionRule[]> {
  const rows = await ctx.db
    .select()
    .from(schema.redemptionRules)
    .where(
      and(eq(schema.redemptionRules.isActive, true), isNull(schema.redemptionRules.archivedAt)),
    )
    .orderBy(asc(schema.redemptionRules.priority), asc(schema.redemptionRules.createdAt))
  return rows.map(rowToRule)
}

export async function loadRedemptionRule(ctx: Context, id: string): Promise<RedemptionRule | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.redemptionRules)
    .where(eq(schema.redemptionRules.id, id))
    .limit(1)
  return row ? rowToRule(row) : null
}

/**
 * Walk active rules in priority order. Returns the first rule whose
 * conditions match the redemption + player, plus that rule's action.
 *
 * If no rule matches, the caller should route to `pending_review` —
 * this function is the auto-approve gate, not a rejector. Returning
 * `pending_review` from a rule (`action='route_to_review'`) is just a
 * way to force review for a class of redemptions (eg "always review
 * KYC level 2 players regardless of amount").
 */
export function evaluateRedemptionRules(
  rules: RedemptionRule[],
  input: RedemptionEvaluationContext,
): RuleEvaluation {
  for (const rule of rules) {
    if (!ruleMatches(rule, input)) continue
    return {
      matchedRule: rule,
      action: rule.action,
    }
  }
  return { matchedRule: null, action: 'pending_review' }
}

function ruleMatches(rule: RedemptionRule, input: RedemptionEvaluationContext): boolean {
  if (!rule.isActive || rule.archivedAt) return false
  if (rule.maxAmountUsd !== null && input.amountUsd > rule.maxAmountUsd) return false
  if (rule.minAmountUsd !== null && input.amountUsd < rule.minAmountUsd) return false
  if (rule.requiredKycLevels.length > 0 && !rule.requiredKycLevels.includes(input.kycLevel)) {
    return false
  }
  if (rule.blockedStates.length > 0 && input.state) {
    const upper = input.state.toUpperCase()
    if (rule.blockedStates.some((s) => s.toUpperCase() === upper)) return false
  }
  if (rule.requirePriorPaidRedemption && input.priorPaidRedemptionCount === 0) return false
  return true
}

// --- writes -----------------------------------------------------------------

export interface RuleInput {
  title: string
  description?: string | null
  priority?: number
  isActive?: boolean
  action?: RedemptionRuleAction
  maxAmountUsd?: bigint | null
  minAmountUsd?: bigint | null
  requiredKycLevels?: number[]
  blockedStates?: string[]
  requirePriorPaidRedemption?: boolean
  completionHours?: number
}

export type RuleError =
  | { code: 'NOT_FOUND' }
  | { code: 'NOT_ADMIN' }
  | { code: 'INVALID_INPUT'; detail: string }
  | { code: 'IMMUTABLE'; detail: string }

function validateInput(input: RuleInput): RuleError | null {
  if (!input.title || input.title.trim().length === 0) {
    return { code: 'INVALID_INPUT', detail: 'title is required' }
  }
  if (input.title.trim().length > 200) {
    return { code: 'INVALID_INPUT', detail: 'title too long (max 200)' }
  }
  if (input.priority !== undefined && (input.priority < 0 || input.priority > 100_000)) {
    return { code: 'INVALID_INPUT', detail: 'priority must be 0..100000' }
  }
  if (input.completionHours !== undefined && input.completionHours < 0) {
    return { code: 'INVALID_INPUT', detail: 'completionHours must be >= 0' }
  }
  if (
    input.maxAmountUsd !== undefined &&
    input.minAmountUsd !== undefined &&
    input.maxAmountUsd !== null &&
    input.minAmountUsd !== null &&
    input.maxAmountUsd < input.minAmountUsd
  ) {
    return { code: 'INVALID_INPUT', detail: 'maxAmountUsd must be >= minAmountUsd' }
  }
  if (input.requiredKycLevels) {
    for (const lvl of input.requiredKycLevels) {
      if (lvl < 0 || lvl > 5) {
        return { code: 'INVALID_INPUT', detail: 'kyc levels must be 0..5' }
      }
    }
  }
  if (input.blockedStates) {
    for (const s of input.blockedStates) {
      if (!/^[A-Za-z]{2}$/.test(s)) {
        return { code: 'INVALID_INPUT', detail: `invalid state code: ${s}` }
      }
    }
  }
  return null
}

export async function createRedemptionRule(
  ctx: Context,
  input: RuleInput,
): Promise<Result<RedemptionRule, RuleError>> {
  if (ctx.actor.kind !== 'admin') return err({ code: 'NOT_ADMIN' })
  const v = validateInput(input)
  if (v) return err(v)

  const adminId = ctx.actor.adminId
  const role = ctx.actor.role
  const [row] = await ctx.db
    .insert(schema.redemptionRules)
    .values({
      title: input.title.trim(),
      description: input.description ?? null,
      priority: input.priority ?? 100,
      isActive: input.isActive ?? true,
      action: input.action ?? 'auto_approve',
      maxAmountUsd: input.maxAmountUsd ?? null,
      minAmountUsd: input.minAmountUsd ?? null,
      requiredKycLevels: input.requiredKycLevels ?? [],
      blockedStates: input.blockedStates ?? [],
      requirePriorPaidRedemption: input.requirePriorPaidRedemption ?? false,
      completionHours: input.completionHours ?? 0,
      createdBy: adminId,
      updatedBy: adminId,
    })
    .returning()
  const rule = rowToRule(row)

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: role,
    action: 'redemption_rule.created',
    resourceKind: 'redemption_rule',
    resourceId: rule.id,
    after: serializeForAudit(rule),
    ip: ctx.actor.ip,
  })

  return ok(rule)
}

export async function updateRedemptionRule(
  ctx: Context,
  id: string,
  input: RuleInput,
): Promise<Result<RedemptionRule, RuleError>> {
  if (ctx.actor.kind !== 'admin') return err({ code: 'NOT_ADMIN' })
  const v = validateInput(input)
  if (v) return err(v)

  const adminId = ctx.actor.adminId
  const role = ctx.actor.role
  const existing = await loadRedemptionRule(ctx, id)
  if (!existing) return err({ code: 'NOT_FOUND' })
  if (existing.archivedAt) return err({ code: 'IMMUTABLE', detail: 'rule archived' })

  const [row] = await ctx.db
    .update(schema.redemptionRules)
    .set({
      title: input.title.trim(),
      description: input.description ?? null,
      priority: input.priority ?? existing.priority,
      isActive: input.isActive ?? existing.isActive,
      action: input.action ?? existing.action,
      maxAmountUsd: input.maxAmountUsd === undefined ? existing.maxAmountUsd : input.maxAmountUsd,
      minAmountUsd: input.minAmountUsd === undefined ? existing.minAmountUsd : input.minAmountUsd,
      requiredKycLevels: input.requiredKycLevels ?? existing.requiredKycLevels,
      blockedStates: input.blockedStates ?? existing.blockedStates,
      requirePriorPaidRedemption:
        input.requirePriorPaidRedemption ?? existing.requirePriorPaidRedemption,
      completionHours: input.completionHours ?? existing.completionHours,
      updatedBy: adminId,
      updatedAt: new Date(),
    })
    .where(eq(schema.redemptionRules.id, id))
    .returning()
  const rule = rowToRule(row)

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: role,
    action: 'redemption_rule.updated',
    resourceKind: 'redemption_rule',
    resourceId: rule.id,
    before: serializeForAudit(existing),
    after: serializeForAudit(rule),
    ip: ctx.actor.ip,
  })

  return ok(rule)
}

export async function setRedemptionRuleActive(
  ctx: Context,
  id: string,
  isActive: boolean,
): Promise<Result<RedemptionRule, RuleError>> {
  if (ctx.actor.kind !== 'admin') return err({ code: 'NOT_ADMIN' })
  const adminId = ctx.actor.adminId
  const role = ctx.actor.role
  const existing = await loadRedemptionRule(ctx, id)
  if (!existing) return err({ code: 'NOT_FOUND' })
  if (existing.archivedAt) return err({ code: 'IMMUTABLE', detail: 'rule archived' })
  if (existing.isActive === isActive) return ok(existing)

  const [row] = await ctx.db
    .update(schema.redemptionRules)
    .set({ isActive, updatedBy: adminId, updatedAt: new Date() })
    .where(eq(schema.redemptionRules.id, id))
    .returning()
  const rule = rowToRule(row)

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: role,
    action: isActive ? 'redemption_rule.enabled' : 'redemption_rule.disabled',
    resourceKind: 'redemption_rule',
    resourceId: rule.id,
    before: { is_active: existing.isActive },
    after: { is_active: rule.isActive },
    ip: ctx.actor.ip,
  })

  return ok(rule)
}

export async function archiveRedemptionRule(
  ctx: Context,
  id: string,
): Promise<Result<RedemptionRule, RuleError>> {
  if (ctx.actor.kind !== 'admin') return err({ code: 'NOT_ADMIN' })
  const adminId = ctx.actor.adminId
  const role = ctx.actor.role
  const existing = await loadRedemptionRule(ctx, id)
  if (!existing) return err({ code: 'NOT_FOUND' })
  if (existing.archivedAt) return ok(existing)

  const [row] = await ctx.db
    .update(schema.redemptionRules)
    .set({
      archivedAt: new Date(),
      isActive: false,
      updatedBy: adminId,
      updatedAt: new Date(),
    })
    .where(eq(schema.redemptionRules.id, id))
    .returning()
  const rule = rowToRule(row)

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: role,
    action: 'redemption_rule.archived',
    resourceKind: 'redemption_rule',
    resourceId: rule.id,
    before: { is_active: existing.isActive },
    after: { archived_at: rule.archivedAt?.toISOString() ?? null },
    ip: ctx.actor.ip,
  })

  return ok(rule)
}

function serializeForAudit(rule: RedemptionRule): Record<string, unknown> {
  return {
    title: rule.title,
    description: rule.description,
    priority: rule.priority,
    is_active: rule.isActive,
    action: rule.action,
    max_amount_usd: rule.maxAmountUsd?.toString() ?? null,
    min_amount_usd: rule.minAmountUsd?.toString() ?? null,
    required_kyc_levels: rule.requiredKycLevels,
    blocked_states: rule.blockedStates,
    require_prior_paid_redemption: rule.requirePriorPaidRedemption,
    completion_hours: rule.completionHours,
  }
}
