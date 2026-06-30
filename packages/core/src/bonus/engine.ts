import { randomUUID } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { emit as emitEvent } from '../events/index'
import { write as ledgerWrite } from '../ledger/write'
import { buildBonusAward } from '../ledger/transactions/bonus-award'
import { publishEvent } from '../realtime/pusher'

import { computeAwardAmounts, type BonusForCompute } from './compute-amount'
import type { AwardError, AwardErrorCode, AwardResult, AwardSpec } from './types'

// docs/06 §4 — the 10-step award path. Single entry point for all 14 bonus
// types.
//
// Design note: we do NOT open one outer transaction wrapping `ledger.write`.
// `ledger.write` already opens its own serializable transaction and Postgres
// forbids `SET TRANSACTION ISOLATION LEVEL` inside an existing tx, so nesting
// would error. Instead the engine runs as a short pipeline:
//
//   1. eligibility pre-checks (read-only)
//   2. idempotency probe on bonuses_awarded.(source_kind, source_id)
//   3. compute amounts
//   4. ledger.write (atomic, serializable) — anchors the audit trail
//   5. INSERT bonuses_awarded with the pair_id from step 4
//   6. bump wallets.playthrough_required (separate column, no balance check)
//   7. audit_log + player_events + Pusher push
//
// The bonuses_awarded UNIQUE on (source_kind, source_id) makes step 5
// idempotent — a concurrent retry will get the duplicate row from step 2 or
// a UNIQUE violation we map to AwardResult.status='duplicate'.

export async function award(
  ctx: Context,
  spec: AwardSpec,
): Promise<Result<AwardResult, AwardError>> {
  // Step 1 — load template and validate state.
  const bonusRows = await ctx.db
    .select({
      id: schema.bonuses.id,
      slug: schema.bonuses.slug,
      displayName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      awardGc: schema.bonuses.awardGc,
      awardSc: schema.bonuses.awardSc,
      awardFormula: schema.bonuses.awardFormula,
      playthroughMultiplier: schema.bonuses.playthroughMultiplier,
      playthroughWindowHours: schema.bonuses.playthroughWindowHours,
      gameWeightOverrides: schema.bonuses.gameWeightOverrides,
      minBetForContribution: schema.bonuses.minBetForContribution,
      maxBetDuringPlaythrough: schema.bonuses.maxBetDuringPlaythrough,
      minTierId: schema.bonuses.minTierId,
      maxPerPlayer: schema.bonuses.maxPerPlayer,
      cooldownHours: schema.bonuses.cooldownHours,
      stackable: schema.bonuses.stackable,
      status: schema.bonuses.status,
      validFrom: schema.bonuses.validFrom,
      validUntil: schema.bonuses.validUntil,
    })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.id, spec.bonusId))
    .limit(1)
  const bonus = bonusRows[0]
  if (!bonus) return errResult('BONUS_NOT_FOUND')
  if (bonus.status !== 'active') return errResult('BONUS_NOT_ACTIVE')
  const now = new Date()
  if (bonus.validFrom && now < bonus.validFrom) return errResult('BONUS_OUTSIDE_VALIDITY')
  if (bonus.validUntil && now > bonus.validUntil) return errResult('BONUS_OUTSIDE_VALIDITY')

  // Step 2 — player + compliance eligibility.
  const playerRows = await ctx.db
    .select({
      id: schema.players.id,
      status: schema.players.status,
      state: schema.players.state,
      deletedAt: schema.players.deletedAt,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
      metadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(eq(schema.players.id, spec.playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player || player.deletedAt) return errResult('PLAYER_NOT_FOUND')
  if (player.status === 'closed' || player.status === 'suspended') {
    return errResult('PLAYER_NOT_ELIGIBLE', `player status=${player.status}`)
  }
  if (
    player.status === 'self_excluded' ||
    (player.rgSelfExcludedUntil && player.rgSelfExcludedUntil > now)
  ) {
    return errResult('SELF_EXCLUDED')
  }

  // docs/06 §15 + docs/09 §8 — SC bonuses cannot land in blocked states. GC-only
  // bonuses are still allowed (player has a GC wallet).
  const blockedStateGcOnly = Boolean(
    (player.metadata as Record<string, unknown> | null)?.blocked_state_gc_only,
  )
  // We'll need amounts to know if this is an SC bonus, so this check happens
  // after compute below.

  const selfExclusion = await ctx.db
    .select({ id: schema.complianceFlags.id })
    .from(schema.complianceFlags)
    .where(
      and(
        eq(schema.complianceFlags.playerId, spec.playerId),
        eq(schema.complianceFlags.flagType, 'self_exclusion'),
        isNull(schema.complianceFlags.clearedAt),
      ),
    )
    .limit(1)
  if (selfExclusion.length > 0) return errResult('SELF_EXCLUDED')

  // Min tier check.
  if (bonus.minTierId) {
    const tierRows = await ctx.db
      .select({
        currentLevel: schema.tierProgress.currentTierLevel,
        currentTierId: schema.tierProgress.currentTierId,
      })
      .from(schema.tierProgress)
      .where(eq(schema.tierProgress.playerId, spec.playerId))
      .limit(1)
    const minTierRows = await ctx.db
      .select({ level: schema.tiers.level })
      .from(schema.tiers)
      .where(eq(schema.tiers.id, bonus.minTierId))
      .limit(1)
    const minLevel = minTierRows[0]?.level ?? 1
    const currentLevel = tierRows[0]?.currentLevel ?? 1
    if (currentLevel < minLevel) return errResult('TIER_INSUFFICIENT')
  }

  // Max-per-player check (lifetime cap).
  if (bonus.maxPerPlayer) {
    const counted = await ctx.db
      .select({ id: schema.bonusesAwarded.id })
      .from(schema.bonusesAwarded)
      .where(
        and(
          eq(schema.bonusesAwarded.playerId, spec.playerId),
          eq(schema.bonusesAwarded.bonusId, bonus.id),
        ),
      )
    if (counted.length >= bonus.maxPerPlayer) return errResult('MAX_AWARDS_REACHED')
  }

  // Cooldown check.
  if (bonus.cooldownHours) {
    const latest = await ctx.db
      .select({ createdAt: schema.bonusesAwarded.createdAt })
      .from(schema.bonusesAwarded)
      .where(
        and(
          eq(schema.bonusesAwarded.playerId, spec.playerId),
          eq(schema.bonusesAwarded.bonusId, bonus.id),
        ),
      )
      .orderBy(sql`${schema.bonusesAwarded.createdAt} desc`)
      .limit(1)
    const last = latest[0]?.createdAt
    if (last) {
      const hoursSince = (now.getTime() - last.getTime()) / 3_600_000
      if (hoursSince < bonus.cooldownHours) {
        return err({
          code: 'COOLDOWN_ACTIVE' as const,
          retryAfterHours: bonus.cooldownHours - hoursSince,
        })
      }
    }
  }

  // Stacking check.
  if (!bonus.stackable) {
    const existingActive = await ctx.db
      .select({ id: schema.bonusesAwarded.id })
      .from(schema.bonusesAwarded)
      .where(
        and(
          eq(schema.bonusesAwarded.playerId, spec.playerId),
          eq(schema.bonusesAwarded.bonusId, bonus.id),
          eq(schema.bonusesAwarded.status, 'active'),
        ),
      )
      .limit(1)
    if (existingActive.length > 0) return errResult('NOT_STACKABLE_ACTIVE_EXISTS')
  }

  // Step 3 — idempotency probe. Identical (source_kind, source_id) returns
  // the existing award row instead of awarding twice.
  const existing = await ctx.db
    .select({ id: schema.bonusesAwarded.id })
    .from(schema.bonusesAwarded)
    .where(
      and(
        eq(schema.bonusesAwarded.sourceKind, spec.sourceKind),
        eq(schema.bonusesAwarded.sourceId, spec.sourceId),
      ),
    )
    .limit(1)
  if (existing[0]) {
    return ok({ status: 'duplicate', awardId: existing[0].id })
  }

  // Step 4 — compute amounts.
  const bonusForCompute: BonusForCompute = {
    awardGc: bonus.awardGc,
    awardSc: bonus.awardSc,
    awardFormula: bonus.awardFormula,
  }
  const amounts = await computeAwardAmounts(ctx, bonusForCompute, spec.playerId, spec.context)
  if (amounts.gc === 0n && amounts.sc === 0n) {
    return errResult('AMOUNT_ZERO', 'Computed award is zero — check formula or static amounts.')
  }

  // SC bonuses in blocked states: drop to noop with audit trail (vs erroring
  // out) — common case for daily/welcome triggered on every player.
  if (blockedStateGcOnly && amounts.sc > 0n && amounts.gc === 0n) {
    return errResult('STATE_BLOCKED', `Player in blocked state (SC suppressed).`)
  }
  // Mixed-currency bonus in a blocked state — drop the SC portion.
  const finalAmounts = {
    gc: amounts.gc,
    sc: blockedStateGcOnly ? 0n : amounts.sc,
  }
  if (finalAmounts.gc === 0n && finalAmounts.sc === 0n) {
    return errResult('STATE_BLOCKED')
  }

  // Step 5 — pre-generate the bonus_award id; ledger.write keys off it.
  const awardId = randomUUID()
  const multiplier = Number(
    spec.playthroughMultiplierOverride ?? Number(bonus.playthroughMultiplier),
  )
  const playthroughRequired = scaleByDecimal(finalAmounts.sc, multiplier)
  const windowHours =
    spec.playthroughWindowOverride === undefined
      ? bonus.playthroughWindowHours
      : spec.playthroughWindowOverride
  const expiresAt = windowHours != null ? new Date(now.getTime() + windowHours * 3_600_000) : null

  // Step 6 — ledger.write (atomic, serializable). One write per currency so
  // each leg has a clean `bonus_pool_*` debit and a `player_wallet` credit.
  //
  // For `pendingClaim` awards we skip the ledger write — the row is
  // inserted with status='pending' below and the ledger entry is written
  // later by `claimPending()` when the player explicitly accepts the
  // bonus from the Available Rewards popover.
  const subBucket = spec.subBucketOverride ?? 'bonus'
  const isPending = spec.pendingClaim === true
  let awardPairId: string | null = null

  if (!isPending && finalAmounts.sc > 0n) {
    const built = buildBonusAward({
      bonusAwardId: awardId,
      playerId: spec.playerId,
      currency: 'SC',
      amount: finalAmounts.sc,
      subBucket,
      metadata: {
        bonus_id: bonus.id,
        bonus_slug: bonus.slug,
        bonus_type: bonus.bonusType,
      },
    })
    const result = await ledgerWrite(ctx, built)
    if (!result.ok) return errResult('LEDGER_FAILED', JSON.stringify(result.error))
    if (result.value.status === 'written') awardPairId = result.value.pairId
  }
  if (!isPending && finalAmounts.gc > 0n) {
    // GC half — distinct source_id so the (source, source_id) idempotency
    // index doesn't collide with the SC write.
    const gcSourceId = finalAmounts.sc > 0n ? `${awardId}:gc` : awardId
    const built = buildBonusAward({
      bonusAwardId: gcSourceId,
      playerId: spec.playerId,
      currency: 'GC',
      amount: finalAmounts.gc,
      subBucket,
      metadata: {
        bonus_id: bonus.id,
        bonus_slug: bonus.slug,
        bonus_type: bonus.bonusType,
      },
    })
    const result = await ledgerWrite(ctx, built)
    if (!result.ok) return errResult('LEDGER_FAILED', JSON.stringify(result.error))
    if (result.value.status === 'written' && !awardPairId) {
      awardPairId = result.value.pairId
    }
  }

  // Step 7 — INSERT bonuses_awarded. We snapshot every overrideable field so
  // future template edits cannot retroactively change this award's contract.
  // Pending rows carry status='pending' until the player claims; otherwise
  // they go straight to 'active' (or 'completed' if no playthrough required).
  const insertStatus: 'pending' | 'active' = isPending ? 'pending' : 'active'
  try {
    await ctx.db.insert(schema.bonusesAwarded).values({
      id: awardId,
      playerId: spec.playerId,
      bonusId: bonus.id,
      gcAmount: finalAmounts.gc,
      scAmount: finalAmounts.sc,
      playthroughMultiplierSnapshot: multiplier.toFixed(2),
      playthroughRequired,
      playthroughProgress: 0n,
      playthroughComplete: finalAmounts.sc === 0n,
      gameWeightOverridesSnapshot: bonus.gameWeightOverrides,
      minBetForContributionSnapshot: bonus.minBetForContribution,
      maxBetDuringPlaythroughSnapshot: bonus.maxBetDuringPlaythrough,
      expiresAt,
      status: insertStatus,
      sourceKind: spec.sourceKind,
      sourceId: spec.sourceId,
      awardedByAdmin: spec.adminId ?? null,
      awardReason: spec.reason ?? null,
      awardPairId,
    })
  } catch (e) {
    if (isUniqueViolation(e, 'bonuses_awarded_source_unique')) {
      // Race: another worker won the insert between our probe and now.
      const winner = await ctx.db
        .select({ id: schema.bonusesAwarded.id })
        .from(schema.bonusesAwarded)
        .where(
          and(
            eq(schema.bonusesAwarded.sourceKind, spec.sourceKind),
            eq(schema.bonusesAwarded.sourceId, spec.sourceId),
          ),
        )
        .limit(1)
      if (winner[0]) return ok({ status: 'duplicate', awardId: winner[0].id })
    }
    return errResult('DB_ERROR', e instanceof Error ? e.message : String(e))
  }

  // Step 8 — bump wallet rollups. Separate columns from the four balance
  // sub-buckets (which the ledger.write already moved), so no balance_sum
  // check fires. Pending awards skip this — the rollup happens in
  // `claimPending()` when the coins actually land.
  if (!isPending && finalAmounts.sc > 0n && playthroughRequired > 0n) {
    await ctx.db
      .update(schema.wallets)
      .set({
        playthroughRequired: sql`${schema.wallets.playthroughRequired} + ${playthroughRequired}::numeric(20,4)`,
        updatedAt: now,
      })
      .where(and(eq(schema.wallets.playerId, spec.playerId), eq(schema.wallets.currency, 'SC')))
  }

  // Step 9 — increment lifetime counter on the template (denorm for admin UI).
  await ctx.db
    .update(schema.bonuses)
    .set({
      awardedCountLifetime: sql`${schema.bonuses.awardedCountLifetime} + 1`,
      updatedAt: now,
    })
    .where(eq(schema.bonuses.id, bonus.id))

  // Step 10 — audit + event + realtime push.
  await writeAuditEntry(ctx.db, {
    actorKind: spec.adminId ? 'admin' : 'system',
    actorId: spec.adminId ?? null,
    action: isPending ? 'bonus.pending_created' : 'bonus.awarded',
    resourceKind: 'bonus_award',
    resourceId: awardId,
    reason: spec.reason ?? null,
    metadata: {
      bonus_id: bonus.id,
      bonus_slug: bonus.slug,
      bonus_type: bonus.bonusType,
      source_kind: spec.sourceKind,
      source_id: spec.sourceId,
      gc_amount: finalAmounts.gc.toString(),
      sc_amount: finalAmounts.sc.toString(),
      multiplier,
      playthrough_required: playthroughRequired.toString(),
      expires_at: expiresAt?.toISOString() ?? null,
      pending: isPending,
    },
  })

  // Skip the player.bonus.awarded analytics event + Pusher bonus-awarded
  // push for pending rows — they fire when the player actually claims
  // (in `claimPending`). Pending creation still surfaces in audit_log.
  if (!isPending) {
    await emitEvent(ctx, {
      name: 'player.bonus.awarded',
      data: {
        playerId: spec.playerId,
        bonusId: bonus.id,
        awardId,
        amount: finalAmounts.sc > 0n ? finalAmounts.sc : finalAmounts.gc,
        currency: finalAmounts.sc > 0n ? 'SC' : 'GC',
        bonusType: bonus.bonusType,
        triggerSource: spec.sourceKind,
      },
    })

    ctx.afterCommit(async () => {
      await publishEvent(`private-player-${spec.playerId}`, 'bonus-awarded', {
        bonusAwardId: awardId,
        bonusName: bonus.displayName,
        bonusType: bonus.bonusType,
        gcAmount: finalAmounts.gc.toString(),
        scAmount: finalAmounts.sc.toString(),
        playthroughRequired: playthroughRequired.toString(),
        expiresAt: expiresAt?.toISOString() ?? null,
      })
    })
  } else {
    // Pending bonus → tell the player so the lightning-bolt button can
    // pulse / the popover badge can update without a polling fetch.
    ctx.afterCommit(async () => {
      await publishEvent(`private-player-${spec.playerId}`, 'bonus-pending', {
        bonusAwardId: awardId,
        bonusName: bonus.displayName,
        bonusType: bonus.bonusType,
        gcAmount: finalAmounts.gc.toString(),
        scAmount: finalAmounts.sc.toString(),
        playthroughRequired: playthroughRequired.toString(),
      })
    })
  }

  if (isPending) {
    return ok({
      status: 'pending',
      awardId,
      gcAmount: finalAmounts.gc,
      scAmount: finalAmounts.sc,
    })
  }
  return ok({
    status: 'awarded',
    awardId,
    pairId: awardPairId ?? '',
    gcAmount: finalAmounts.gc,
    scAmount: finalAmounts.sc,
  })
}

// ---------- helpers ----------

function errResult(code: AwardErrorCode, reason?: string): Result<never, AwardError> {
  return err({ code, reason })
}

function isUniqueViolation(e: unknown, constraintName: string): boolean {
  if (typeof e !== 'object' || e === null) return false
  const maybe = e as { code?: string; constraint_name?: string; message?: string }
  if (maybe.code !== '23505') return false
  if (maybe.constraint_name === constraintName) return true
  return Boolean(maybe.message?.includes(constraintName))
}

/**
 * Multiply a money-minor-unit bigint by a decimal multiplier. Used for
 * `required = sc * multiplier`. 4 decimals of multiplier precision matches
 * the `numeric(5,2)` template column (which has 2 decimals) with headroom.
 */
function scaleByDecimal(amount: bigint, multiplier: number): bigint {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0n
  const scaled = BigInt(Math.floor(multiplier * 100))
  return (amount * scaled) / 100n
}
