import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'
import { write as ledgerWrite } from '../ledger/write'
import { buildRedemptionRejected } from '../ledger/transactions/redemption-rejected'
import type { SubBucket } from '../ledger/types'
import { publishEvent } from '../realtime/pusher'

import { loadRedemption } from './create'
import type { PersistedDrainStep, RedemptionRecord, RejectError } from './types'

// docs/07 §7.2 — reject a redemption. Returns SC to the player wallet,
// preserving the original sub-bucket split from drain_plan.
//
// Allowed source states: anything pre-payment. Rejecting after `paid` is
// impossible (the money's gone — that's a clawback path, see docs/04
// §3.10 / docs/07 §12).

export interface RejectSpec {
  redemptionId: string
  reason: string
  reasonCategory: string
  /**
   * Override the terminal status. Defaults to `'rejected'`. Set to
   * `'failed'` for processor-side failures (Finix returned FAILED) so the
   * audit trail keeps the failure cause separate from admin rejection.
   * Set to `'cancelled'` when the cashier (or the player themself) is
   * voluntarily killing the request without it being a fraud/policy
   * call — same SC return, different audit verb.
   */
  finalStatus?: 'rejected' | 'failed' | 'cancelled'
}

export async function rejectRedemption(
  ctx: Context,
  spec: RejectSpec,
): Promise<Result<RedemptionRecord, RejectError>> {
  const redemption = await loadRedemption(ctx, spec.redemptionId)
  if (!redemption) return err({ code: 'NOT_FOUND' })
  if (redemption.status === 'paid') return err({ code: 'ALREADY_PAID' })
  if (redemption.status === 'rejected' || redemption.status === 'cancelled') {
    return err({ code: 'INVALID_STATE', current: redemption.status })
  }

  // Update the row first; ledger.write is idempotent on (source, source_id)
  // so a retry after a partial failure converges.
  const adminActor = ctx.actor.kind === 'admin' ? ctx.actor : null
  const finalStatus = spec.finalStatus ?? 'rejected'
  await ctx.db
    .update(schema.redemptions)
    .set({
      status: finalStatus,
      rejectedBy: adminActor?.adminId ?? null,
      rejectedAt: new Date(),
      rejectionReason: spec.reason,
      rejectionCategory: spec.reasonCategory,
      failureReason: finalStatus === 'failed' ? spec.reason : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.redemptions.id, redemption.id))

  // Only return SC to the wallet if the request actually locked any.
  // `kyc_pending` redemptions skip the lock (see create.ts §4) so there's
  // nothing to refund — just close out the row.
  const splits = drainPlanToSplits(redemption.drainPlan)
  const totalLocked = splits.reduce((sum, s) => sum + s.amount, 0n)

  if (totalLocked > 0n && redemption.status !== 'kyc_pending') {
    const built = buildRedemptionRejected({
      redemptionId: redemption.id,
      playerId: redemption.playerId,
      splits,
    })
    const result = await ledgerWrite(ctx, built)
    if (!result.ok) {
      return err({ code: 'LEDGER_WRITE_FAILED', reason: result.error.code })
    }
  }

  const auditAction =
    finalStatus === 'failed'
      ? 'redemption.failed'
      : finalStatus === 'cancelled'
        ? 'redemption.cancelled'
        : 'redemption.rejected'
  await writeAuditEntry(ctx.db, {
    actorKind: adminActor ? 'admin' : 'system',
    actorId: adminActor?.adminId ?? null,
    actorRole: adminActor?.role ?? null,
    action: auditAction,
    resourceKind: 'redemption',
    resourceId: redemption.id,
    before: { status: redemption.status },
    after: { status: finalStatus },
    reason: spec.reason,
    metadata: { category: spec.reasonCategory },
  })

  const eventName =
    finalStatus === 'failed'
      ? 'player.redemption.failed'
      : finalStatus === 'cancelled'
        ? 'player.redemption.cancelled'
        : 'player.redemption.rejected'
  await recordPlayerEvent(ctx.db, {
    playerId: redemption.playerId,
    eventName,
    eventCategory: 'redemption',
    payload: {
      redemption_id: redemption.id,
      amount_usd: redemption.amountUsd.toString(),
      reason: spec.reason,
      category: spec.reasonCategory,
    },
  })

  await publishEvent(`private-player-${redemption.playerId}`, 'redemption-update', {
    redemptionId: redemption.id,
    status: finalStatus,
  })

  const fresh = await loadRedemption(ctx, redemption.id)
  if (!fresh) return err({ code: 'NOT_FOUND' })
  return ok(fresh)
}

function drainPlanToSplits(plan: PersistedDrainStep[]): { subBucket: SubBucket; amount: bigint }[] {
  return plan.map((step) => ({
    subBucket: step.bucket,
    amount: BigInt(step.amount),
  }))
}
