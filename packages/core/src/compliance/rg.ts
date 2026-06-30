// docs/09 §7 — Responsible Gaming controls.
//
// Three pillars: self-exclusion, deposit limits, session limits. The
// service-layer functions write to `players` (the live limits) and
// `player_limit_changes` (the 24h delay queue) plus `compliance_flags` and
// `audit_log`. Better Auth session revocation on self-exclude lives in the
// web app's API route (it needs the Better Auth server instance); here we
// just persist the player-side state.

import { and, eq, isNull } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'

export type SelfExclusionDuration = '1d' | '7d' | '30d' | '1y' | 'permanent'

const DURATION_MS: Record<Exclude<SelfExclusionDuration, 'permanent'>, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
}

export interface SelfExcludeInput {
  playerId: string
  duration: SelfExclusionDuration
  reason?: string | null
  ip?: string | null
  userAgent?: string | null
}

export interface SelfExcludeResult {
  expiresAt: Date | null
  permanent: boolean
}

/**
 * Apply self-exclusion. Sets the player's status to 'self_excluded', writes
 * a compliance_flags row, and audit-logs the action. Per docs/09 §7.1 the
 * player CANNOT shorten this — only Master admin can, and only if it's an
 * obvious mistake (re-enable in admin tooling, not here).
 */
export async function selfExclude(
  db: DbExecutor,
  input: SelfExcludeInput,
): Promise<Result<SelfExcludeResult, { kind: 'already_excluded' }>> {
  const now = new Date()
  const expiresAt =
    input.duration === 'permanent' ? null : new Date(now.getTime() + DURATION_MS[input.duration])

  const existing = await db
    .select({
      id: schema.players.id,
      status: schema.players.status,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)

  const player = existing[0]
  if (!player) return err({ kind: 'already_excluded' as const })

  if (player.status === 'self_excluded') {
    // Allow extending — pick the longer of the two.
    const currentUntil = player.rgSelfExcludedUntil
    if (currentUntil === null || (expiresAt && currentUntil > expiresAt)) {
      return err({ kind: 'already_excluded' as const })
    }
  }

  await db
    .update(schema.players)
    .set({
      status: 'self_excluded',
      statusReason: input.reason ?? `Self-excluded for ${input.duration}`,
      rgSelfExcludedUntil: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, input.playerId))

  await db.insert(schema.complianceFlags).values({
    playerId: input.playerId,
    flagType: 'self_exclusion',
    severity: 'block',
    reason: input.reason ?? `Self-excluded for ${input.duration}`,
    expiresAt,
    metadata: { duration: input.duration },
    createdBy: null,
  })

  await recordPlayerEvent(db, {
    playerId: input.playerId,
    eventName: 'player.self_exclude',
    eventCategory: 'compliance',
    payload: {
      duration: input.duration,
      expires_at: expiresAt?.toISOString() ?? null,
    },
  })

  await writeAuditEntry(db, {
    actorKind: 'player',
    actorId: input.playerId,
    action: 'player.self_exclude',
    resourceKind: 'player',
    resourceId: input.playerId,
    before: {
      status: player.status,
      rg_self_excluded_until: player.rgSelfExcludedUntil?.toISOString() ?? null,
    },
    after: {
      status: 'self_excluded',
      rg_self_excluded_until: expiresAt?.toISOString() ?? null,
    },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: { duration: input.duration },
  })

  return ok({ expiresAt, permanent: input.duration === 'permanent' })
}

export type DepositLimitKind = 'deposit_daily' | 'deposit_weekly' | 'deposit_monthly'

export interface UpdateDepositLimitInput {
  playerId: string
  kind: DepositLimitKind
  /** Money in minor units (1/10000 USD) — null clears the limit. */
  nextValue: bigint | null
  ip?: string | null
  userAgent?: string | null
}

export interface UpdateDepositLimitResult {
  /**
   * 'applied'   — the new value is already live (decrease or first set)
   * 'pending'   — increase queued for 24h
   */
  status: 'applied' | 'pending'
  applyAt: Date | null
  previousValue: bigint | null
}

/**
 * Update a deposit limit. Decreases (and removing a limit, and going from
 * null → some value) apply immediately. Increases queue in
 * `player_limit_changes` with apply_at = now + 24h per docs/09 §7.2.
 */
export async function updateDepositLimit(
  db: DbExecutor,
  input: UpdateDepositLimitInput,
): Promise<Result<UpdateDepositLimitResult, { kind: 'not_found' }>> {
  const existing = await db
    .select({
      rgDepositLimitDaily: schema.players.rgDepositLimitDaily,
      rgDepositLimitWeekly: schema.players.rgDepositLimitWeekly,
      rgDepositLimitMonthly: schema.players.rgDepositLimitMonthly,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)

  const row = existing[0]
  if (!row) return err({ kind: 'not_found' as const })

  const currentValue: bigint | null =
    input.kind === 'deposit_daily'
      ? row.rgDepositLimitDaily
      : input.kind === 'deposit_weekly'
        ? row.rgDepositLimitWeekly
        : row.rgDepositLimitMonthly

  const isIncrease =
    currentValue !== null && input.nextValue !== null && input.nextValue > currentValue
  const isLifting = currentValue !== null && input.nextValue === null

  if (isIncrease || isLifting) {
    // Queue for 24h. Cancel any older pending change for this limit first.
    await db
      .update(schema.playerLimitChanges)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.playerLimitChanges.playerId, input.playerId),
          eq(schema.playerLimitChanges.limitKind, input.kind),
          isNull(schema.playerLimitChanges.appliedAt),
          isNull(schema.playerLimitChanges.cancelledAt),
        ),
      )

    const applyAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.insert(schema.playerLimitChanges).values({
      playerId: input.playerId,
      limitKind: input.kind,
      previousValue: currentValue !== null ? currentValue.toString() : null,
      nextValue: input.nextValue !== null ? input.nextValue.toString() : 'null',
      direction: 'increase',
      applyAt,
    })

    await writeAuditEntry(db, {
      actorKind: 'player',
      actorId: input.playerId,
      action: 'player.rg.limit_change_queued',
      resourceKind: 'player',
      resourceId: input.playerId,
      before: { [input.kind]: currentValue?.toString() ?? null },
      after: { [input.kind]: input.nextValue?.toString() ?? null, apply_at: applyAt.toISOString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    return ok({ status: 'pending', applyAt, previousValue: currentValue })
  }

  // Apply immediately.
  if (input.kind === 'deposit_daily') {
    await db
      .update(schema.players)
      .set({ rgDepositLimitDaily: input.nextValue, updatedAt: new Date() })
      .where(eq(schema.players.id, input.playerId))
  } else if (input.kind === 'deposit_weekly') {
    await db
      .update(schema.players)
      .set({ rgDepositLimitWeekly: input.nextValue, updatedAt: new Date() })
      .where(eq(schema.players.id, input.playerId))
  } else {
    await db
      .update(schema.players)
      .set({ rgDepositLimitMonthly: input.nextValue, updatedAt: new Date() })
      .where(eq(schema.players.id, input.playerId))
  }

  await writeAuditEntry(db, {
    actorKind: 'player',
    actorId: input.playerId,
    action: 'player.rg.limit_changed',
    resourceKind: 'player',
    resourceId: input.playerId,
    before: { [input.kind]: currentValue?.toString() ?? null },
    after: { [input.kind]: input.nextValue?.toString() ?? null },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })

  return ok({ status: 'applied', applyAt: null, previousValue: currentValue })
}

export interface UpdateSessionLimitInput {
  playerId: string
  /** Minutes. Null lifts the limit (24h delay). */
  nextMinutes: number | null
  ip?: string | null
  userAgent?: string | null
}

export async function updateSessionLimit(
  db: DbExecutor,
  input: UpdateSessionLimitInput,
): Promise<Result<UpdateDepositLimitResult, { kind: 'not_found' }>> {
  const existing = await db
    .select({ rgSessionLimitMin: schema.players.rgSessionLimitMin })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)

  const row = existing[0]
  if (!row) return err({ kind: 'not_found' as const })

  const currentValue: bigint | null =
    row.rgSessionLimitMin === null ? null : BigInt(row.rgSessionLimitMin)
  const nextBig: bigint | null = input.nextMinutes === null ? null : BigInt(input.nextMinutes)

  const isIncrease = currentValue !== null && nextBig !== null && nextBig > currentValue
  const isLifting = currentValue !== null && nextBig === null

  if (isIncrease || isLifting) {
    await db
      .update(schema.playerLimitChanges)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.playerLimitChanges.playerId, input.playerId),
          eq(schema.playerLimitChanges.limitKind, 'session'),
          isNull(schema.playerLimitChanges.appliedAt),
          isNull(schema.playerLimitChanges.cancelledAt),
        ),
      )

    const applyAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.insert(schema.playerLimitChanges).values({
      playerId: input.playerId,
      limitKind: 'session',
      previousValue: currentValue?.toString() ?? null,
      nextValue: nextBig?.toString() ?? 'null',
      direction: 'increase',
      applyAt,
    })

    await writeAuditEntry(db, {
      actorKind: 'player',
      actorId: input.playerId,
      action: 'player.rg.session_limit_queued',
      resourceKind: 'player',
      resourceId: input.playerId,
      before: { session_minutes: currentValue?.toString() ?? null },
      after: { session_minutes: nextBig?.toString() ?? null, apply_at: applyAt.toISOString() },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    return ok({ status: 'pending', applyAt, previousValue: currentValue })
  }

  await db
    .update(schema.players)
    .set({ rgSessionLimitMin: input.nextMinutes, updatedAt: new Date() })
    .where(eq(schema.players.id, input.playerId))

  await writeAuditEntry(db, {
    actorKind: 'player',
    actorId: input.playerId,
    action: 'player.rg.session_limit_changed',
    resourceKind: 'player',
    resourceId: input.playerId,
    before: { session_minutes: currentValue?.toString() ?? null },
    after: { session_minutes: nextBig?.toString() ?? null },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })

  return ok({ status: 'applied', applyAt: null, previousValue: currentValue })
}

export interface RGState {
  status: string
  selfExcludedUntil: Date | null
  depositLimitDaily: bigint | null
  depositLimitWeekly: bigint | null
  depositLimitMonthly: bigint | null
  sessionLimitMin: number | null
  pendingChanges: Array<{
    id: string
    limitKind: string
    nextValue: string
    applyAt: Date
    requestedAt: Date
  }>
}

export async function getRGState(db: DbExecutor, playerId: string): Promise<RGState | null> {
  const rows = await db
    .select({
      status: schema.players.status,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
      rgDepositLimitDaily: schema.players.rgDepositLimitDaily,
      rgDepositLimitWeekly: schema.players.rgDepositLimitWeekly,
      rgDepositLimitMonthly: schema.players.rgDepositLimitMonthly,
      rgSessionLimitMin: schema.players.rgSessionLimitMin,
    })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const pending = await db
    .select({
      id: schema.playerLimitChanges.id,
      limitKind: schema.playerLimitChanges.limitKind,
      nextValue: schema.playerLimitChanges.nextValue,
      applyAt: schema.playerLimitChanges.applyAt,
      requestedAt: schema.playerLimitChanges.requestedAt,
    })
    .from(schema.playerLimitChanges)
    .where(
      and(
        eq(schema.playerLimitChanges.playerId, playerId),
        isNull(schema.playerLimitChanges.appliedAt),
        isNull(schema.playerLimitChanges.cancelledAt),
      ),
    )
    .orderBy(schema.playerLimitChanges.applyAt)

  return {
    status: row.status,
    selfExcludedUntil: row.rgSelfExcludedUntil,
    depositLimitDaily: row.rgDepositLimitDaily,
    depositLimitWeekly: row.rgDepositLimitWeekly,
    depositLimitMonthly: row.rgDepositLimitMonthly,
    sessionLimitMin: row.rgSessionLimitMin,
    pendingChanges: pending,
  }
}
