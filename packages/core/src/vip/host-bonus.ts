import { and, eq, gte, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { HOST_WEEKLY_BONUS_CAP_SC } from '../auth/permissions'
import { award as awardBonus } from '../bonus/engine'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { logInteraction } from './interactions'

// M4 — Host bonus award flow.
//
// Hosts may award bonuses to their VIPs, but only:
//   1. Templates marked `bonuses.host_available = true`
//   2. To players where `players.assigned_host_id = current host`
//   3. Up to HOST_WEEKLY_BONUS_CAP_SC of SC value per VIP per rolling 7d
//
// Anything exceeding these rules fails closed with a helpful message.

export interface HostWeeklyBudget {
  capSc: bigint
  usedSc: bigint
  remainingSc: bigint
  windowDays: number
}

/**
 * Compute the rolling weekly SC budget already used by a host for one
 * specific VIP. Sums `host_player_interactions` rows of type 'bonus_sent'
 * over the last 7 days.
 */
export async function getHostWeeklyBonusBudget(
  ctx: Context,
  hostId: string,
  playerId: string,
): Promise<HostWeeklyBudget> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const rows: { used: string }[] = await ctx.db
    .select({
      used: sql<string>`COALESCE(SUM((metadata->>'sc_amount')::numeric), 0)::text`,
    })
    .from(schema.hostPlayerInteractions)
    .where(
      and(
        eq(schema.hostPlayerInteractions.hostId, hostId),
        eq(schema.hostPlayerInteractions.playerId, playerId),
        eq(schema.hostPlayerInteractions.interactionType, 'bonus_sent'),
        gte(schema.hostPlayerInteractions.createdAt, cutoff),
      ),
    )

  // The metadata.sc_amount is stored as a minor-unit bigint string. SUM in
  // SQL returns a numeric; we parse to bigint, defaulting to 0.
  const usedRaw = rows[0]?.used ?? '0'
  const usedSc = parseUsedAmount(usedRaw)
  const cap = HOST_WEEKLY_BONUS_CAP_SC
  const remaining = usedSc >= cap ? 0n : cap - usedSc
  return {
    capSc: cap,
    usedSc,
    remainingSc: remaining,
    windowDays: 7,
  }
}

function parseUsedAmount(raw: string): bigint {
  // Numeric SUM can come back as "1234.000000" or "1234"; we don't want
  // fractional bigint conversion to throw. Truncate at the dot, then BigInt.
  const integerPart = raw.split('.')[0] ?? '0'
  try {
    return BigInt(integerPart)
  } catch {
    return 0n
  }
}

export type HostAwardErrorCode =
  | 'PLAYER_NOT_ASSIGNED'
  | 'TEMPLATE_NOT_HOST_AVAILABLE'
  | 'TEMPLATE_INACTIVE'
  | 'WEEKLY_CAP_EXCEEDED'
  | 'BONUS_AWARD_FAILED'

export interface HostAwardError {
  code: HostAwardErrorCode
  reason?: string
  budget?: HostWeeklyBudget
}

export interface HostAwardResult {
  awardId: string
  budget: HostWeeklyBudget
}

/**
 * Returns `ok` if the host may award this bonus to this player right now;
 * otherwise returns a structured error explaining why. Pure validation —
 * no side effects.
 */
export async function canHostAwardBonus(
  ctx: Context,
  args: { hostId: string; playerId: string; bonusId: string },
): Promise<Result<{ budget: HostWeeklyBudget; bonusScAmount: bigint }, HostAwardError>> {
  const { hostId, playerId, bonusId } = args

  // 1. ownership
  const playerRows = await ctx.db
    .select({ id: schema.players.id, assignedHostId: schema.players.assignedHostId })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player || player.assignedHostId !== hostId) {
    return err({ code: 'PLAYER_NOT_ASSIGNED' })
  }

  // 2. template marked host-available + active
  const bonusRows = await ctx.db
    .select({
      id: schema.bonuses.id,
      awardSc: schema.bonuses.awardSc,
      status: schema.bonuses.status,
      hostAvailable: schema.bonuses.hostAvailable,
    })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.id, bonusId))
    .limit(1)
  const bonus = bonusRows[0]
  if (!bonus) return err({ code: 'TEMPLATE_NOT_HOST_AVAILABLE' })
  if (!bonus.hostAvailable) return err({ code: 'TEMPLATE_NOT_HOST_AVAILABLE' })
  if (bonus.status !== 'active') return err({ code: 'TEMPLATE_INACTIVE' })

  // 3. weekly cap
  const budget = await getHostWeeklyBonusBudget(ctx, hostId, playerId)
  if (bonus.awardSc > budget.remainingSc) {
    return err({
      code: 'WEEKLY_CAP_EXCEEDED',
      reason: `Weekly cap exceeded. Used ${formatMinor(budget.usedSc)} SC, would bring total to ${formatMinor(budget.usedSc + bonus.awardSc)} SC; cap is ${formatMinor(budget.capSc)} SC. Contact your manager to award more.`,
      budget,
    })
  }

  return ok({ budget, bonusScAmount: bonus.awardSc })
}

/**
 * Award a host-initiated bonus end-to-end:
 *   1. validate via canHostAwardBonus
 *   2. fire bonus engine
 *   3. log to host_player_interactions with metadata
 *   4. (audit_log is written by the bonus engine, with adminId=host)
 */
export async function awardHostBonus(
  ctx: Context,
  args: {
    hostId: string
    playerId: string
    bonusId: string
    note?: string | null
  },
): Promise<Result<HostAwardResult, HostAwardError>> {
  const check = await canHostAwardBonus(ctx, args)
  if (!check.ok) return check

  const sourceId = `host:${args.hostId}:${args.playerId}:${args.bonusId}:${Date.now()}`
  const result = await awardBonus(ctx, {
    playerId: args.playerId,
    bonusId: args.bonusId,
    // We use the admin_manual taxonomy because host awards are still
    // admin-initiated (just by a contractor admin). The host-specific
    // breadcrumb lives in host_player_interactions.metadata.
    sourceKind: 'admin_manual',
    sourceId,
    adminId: args.hostId,
    reason: args.note ?? null,
  })
  if (!result.ok) {
    return err({ code: 'BONUS_AWARD_FAILED', reason: result.error.code })
  }

  // Refetch budget post-award so the UI sees the new "used" amount.
  await logInteraction(ctx.db, {
    hostId: args.hostId,
    playerId: args.playerId,
    type: 'bonus_sent',
    notes: args.note ?? null,
    metadata: {
      bonus_id: args.bonusId,
      award_id: result.value.awardId,
      sc_amount: check.value.bonusScAmount.toString(),
    },
    actorRole: 'host',
  })

  const budget = await getHostWeeklyBonusBudget(ctx, args.hostId, args.playerId)
  return ok({
    awardId: result.value.awardId,
    budget,
  })
}

function formatMinor(value: bigint): string {
  const major = value / 10000n
  const minor = value % 10000n
  const minorStr = minor.toString().padStart(4, '0').slice(0, 2)
  return `${major}.${minorStr}`
}
