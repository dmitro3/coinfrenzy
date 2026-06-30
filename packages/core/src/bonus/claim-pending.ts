import { and, eq, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { emit as emitEvent } from '../events/index'
import { write as ledgerWrite } from '../ledger/write'
import { buildBonusAward } from '../ledger/transactions/bonus-award'
import { publishEvent } from '../realtime/pusher'

// docs/06 §13 (pending claim extension) — the player explicitly accepts
// a previously-awarded `bonuses_awarded` row, at which point the
// engine writes the deferred ledger entry, bumps the wallet's
// `playthrough_required` rollup, and flips the row's status from
// `pending` → `active` (or `completed` if no playthrough was required).
//
// All claims are idempotent on the bonuses_awarded.id — a second click
// after the first succeeds returns the same outcome via `duplicate`.

export type ClaimPendingErrorCode =
  | 'AWARD_NOT_FOUND'
  | 'AWARD_NOT_PENDING'
  | 'WRONG_PLAYER'
  | 'LEDGER_FAILED'
  | 'DB_ERROR'

export interface ClaimPendingError {
  code: ClaimPendingErrorCode
  reason?: string
}

export type ClaimPendingResult =
  | {
      status: 'claimed'
      awardId: string
      pairId: string
      gcAmount: bigint
      scAmount: bigint
      bonusSlug: string
      bonusName: string
    }
  | {
      // The row was already active/completed — return its current shape
      // so callers can re-show the celebration deterministically.
      status: 'duplicate'
      awardId: string
      gcAmount: bigint
      scAmount: bigint
      bonusSlug: string
      bonusName: string
    }

export interface ClaimPendingInput {
  /** bonuses_awarded.id — the row the player wants to claim. */
  awardId: string
  /** Authenticated player id — must own the row. */
  playerId: string
}

export async function claimPending(
  ctx: Context,
  input: ClaimPendingInput,
): Promise<Result<ClaimPendingResult, ClaimPendingError>> {
  const now = new Date()

  // Step 1 — load the pending award + the template (we need slug / name
  // for the ledger metadata and the realtime push).
  const rows = await ctx.db
    .select({
      awardId: schema.bonusesAwarded.id,
      playerId: schema.bonusesAwarded.playerId,
      bonusId: schema.bonusesAwarded.bonusId,
      gcAmount: schema.bonusesAwarded.gcAmount,
      scAmount: schema.bonusesAwarded.scAmount,
      status: schema.bonusesAwarded.status,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      sourceKind: schema.bonusesAwarded.sourceKind,
      sourceId: schema.bonusesAwarded.sourceId,
      awardReason: schema.bonusesAwarded.awardReason,
      bonusSlug: schema.bonuses.slug,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
    })
    .from(schema.bonusesAwarded)
    .innerJoin(schema.bonuses, eq(schema.bonusesAwarded.bonusId, schema.bonuses.id))
    .where(eq(schema.bonusesAwarded.id, input.awardId))
    .limit(1)
  const row = rows[0]
  if (!row) return err({ code: 'AWARD_NOT_FOUND' })
  if (row.playerId !== input.playerId) return err({ code: 'WRONG_PLAYER' })

  const gcAmount = BigInt(row.gcAmount as unknown as string)
  const scAmount = BigInt(row.scAmount as unknown as string)
  const playthroughRequired = BigInt(row.playthroughRequired as unknown as string)

  // If the row was already claimed (status !== 'pending'), return a
  // deterministic duplicate result so the popover can still show the
  // celebration view without re-writing the ledger.
  if (row.status !== 'pending') {
    if (row.status === 'active' || row.status === 'completed') {
      return ok({
        status: 'duplicate',
        awardId: row.awardId,
        gcAmount,
        scAmount,
        bonusSlug: row.bonusSlug,
        bonusName: row.bonusName,
      })
    }
    return err({ code: 'AWARD_NOT_PENDING', reason: `status=${row.status}` })
  }

  // Step 2 — ledger.write(s). Same shape as engine.award() step 6, but
  // we never split GC + SC into a single award row in pending mode
  // (the engine wrote one bonuses_awarded row for the pair), so reuse
  // the same idempotency anchor pattern.
  //
  // Promo-code-style sub-bucket is not propagated through pending rows
  // today — admins/affiliate use the default 'bonus' bucket.
  let pairId: string | null = null
  let updateApplied = false

  if (scAmount > 0n) {
    const built = buildBonusAward({
      bonusAwardId: row.awardId,
      playerId: row.playerId,
      currency: 'SC',
      amount: scAmount,
      subBucket: 'bonus',
      metadata: {
        bonus_id: row.bonusId,
        bonus_slug: row.bonusSlug,
        bonus_type: row.bonusType,
        claimed_from: 'pending',
      },
    })
    const result = await ledgerWrite(ctx, built)
    if (!result.ok) {
      return err({ code: 'LEDGER_FAILED', reason: JSON.stringify(result.error) })
    }
    if (result.value.status === 'written') pairId = result.value.pairId
  }
  if (gcAmount > 0n) {
    const gcSourceId = scAmount > 0n ? `${row.awardId}:gc` : row.awardId
    const built = buildBonusAward({
      bonusAwardId: gcSourceId,
      playerId: row.playerId,
      currency: 'GC',
      amount: gcAmount,
      subBucket: 'bonus',
      metadata: {
        bonus_id: row.bonusId,
        bonus_slug: row.bonusSlug,
        bonus_type: row.bonusType,
        claimed_from: 'pending',
      },
    })
    const result = await ledgerWrite(ctx, built)
    if (!result.ok) {
      return err({ code: 'LEDGER_FAILED', reason: JSON.stringify(result.error) })
    }
    if (result.value.status === 'written' && !pairId) {
      pairId = result.value.pairId
    }
  }

  // Step 3 — flip the row: pending → active (or 'completed' if there's
  // no SC playthrough to satisfy). We don't UPDATE id/source_id/etc —
  // those snapshot the contract at award time.
  const newStatus: 'active' | 'completed' =
    scAmount > 0n && playthroughRequired > 0n ? 'active' : 'completed'
  try {
    const updated = await ctx.db
      .update(schema.bonusesAwarded)
      .set({
        status: newStatus,
        awardPairId: pairId,
        playthroughComplete: newStatus === 'completed',
        completedAt: newStatus === 'completed' ? now : null,
      })
      .where(
        and(
          eq(schema.bonusesAwarded.id, row.awardId),
          // Belt-and-suspenders: only flip if the row is still pending,
          // so two concurrent claim calls don't both run the ledger.
          // (The ledger.write idempotency would catch the second write,
          // but the row update should also be guarded.)
          eq(schema.bonusesAwarded.status, 'pending'),
        ),
      )
      .returning({ id: schema.bonusesAwarded.id })
    updateApplied = updated.length > 0
  } catch (e) {
    return err({ code: 'DB_ERROR', reason: e instanceof Error ? e.message : String(e) })
  }

  if (!updateApplied) {
    return ok({
      status: 'duplicate',
      awardId: row.awardId,
      gcAmount,
      scAmount,
      bonusSlug: row.bonusSlug,
      bonusName: row.bonusName,
    })
  }

  // Step 4 — bump wallet playthrough_required (the rollup the engine
  // skipped when creating the pending row).
  if (scAmount > 0n && playthroughRequired > 0n) {
    await ctx.db
      .update(schema.wallets)
      .set({
        playthroughRequired: sql`${schema.wallets.playthroughRequired} + ${playthroughRequired}::numeric(20,4)`,
        updatedAt: now,
      })
      .where(and(eq(schema.wallets.playerId, row.playerId), eq(schema.wallets.currency, 'SC')))
  }

  // Step 5 — audit + analytics + Pusher push. Mirrors engine.award()
  // step 10 so downstream consumers (CRM, dashboards) see the same
  // event shape they get for an immediate award.
  await writeAuditEntry(ctx.db, {
    actorKind: 'player',
    actorId: row.playerId,
    action: 'bonus.pending_claimed',
    resourceKind: 'bonus_award',
    resourceId: row.awardId,
    reason: row.awardReason ?? null,
    metadata: {
      bonus_id: row.bonusId,
      bonus_slug: row.bonusSlug,
      bonus_type: row.bonusType,
      source_kind: row.sourceKind,
      source_id: row.sourceId,
      gc_amount: gcAmount.toString(),
      sc_amount: scAmount.toString(),
      playthrough_required: playthroughRequired.toString(),
    },
  })

  await emitEvent(ctx, {
    name: 'player.bonus.awarded',
    data: {
      playerId: row.playerId,
      bonusId: row.bonusId,
      awardId: row.awardId,
      amount: scAmount > 0n ? scAmount : gcAmount,
      currency: scAmount > 0n ? 'SC' : 'GC',
      bonusType: row.bonusType,
      triggerSource: row.sourceKind ?? 'admin_manual',
    },
  })

  ctx.afterCommit(async () => {
    await publishEvent(`private-player-${row.playerId}`, 'bonus-awarded', {
      bonusAwardId: row.awardId,
      bonusName: row.bonusName,
      bonusType: row.bonusType,
      gcAmount: gcAmount.toString(),
      scAmount: scAmount.toString(),
      playthroughRequired: playthroughRequired.toString(),
      expiresAt: null,
    })
  })

  return ok({
    status: 'claimed',
    awardId: row.awardId,
    pairId: pairId ?? '',
    gcAmount,
    scAmount,
    bonusSlug: row.bonusSlug,
    bonusName: row.bonusName,
  })
}
