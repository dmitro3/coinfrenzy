import { and, eq, isNull } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'
import { publishEvent } from '../realtime/pusher'

import { loadRedemption } from './create'
import type { AmlActionError, RedemptionRecord } from './types'

// docs/07 §7.3 — manager actions on the AML hold queue. Three actions:
//   - clear: false positive — clears the aml_watchlist flag, redemption
//     returns to pending_review.
//   - confirm_hold: keep the flag + redemption stuck; player remains under
//     monitoring until the next monthly review.
//   - escalate: suspend the player account, route to legal.

export type AmlAction = 'clear' | 'confirm_hold' | 'escalate'

export interface AmlActionSpec {
  redemptionId: string
  action: AmlAction
  notes?: string | null
}

export async function actOnAmlHold(
  ctx: Context,
  spec: AmlActionSpec,
): Promise<Result<RedemptionRecord, AmlActionError>> {
  if (ctx.actor.kind !== 'admin') return err({ code: 'INSUFFICIENT_PERMISSIONS' })
  const role = ctx.actor.role
  if (role !== 'manager' && role !== 'master') {
    return err({ code: 'INSUFFICIENT_PERMISSIONS' })
  }
  const adminId = ctx.actor.adminId

  const redemption = await loadRedemption(ctx, spec.redemptionId)
  if (!redemption) return err({ code: 'NOT_FOUND' })
  if (redemption.status !== 'aml_hold') return err({ code: 'NOT_AML_HOLD' })

  switch (spec.action) {
    case 'clear': {
      // 1) clear the open aml_watchlist flag
      await ctx.db
        .update(schema.complianceFlags)
        .set({
          clearedAt: new Date(),
          clearedBy: adminId,
          clearedReason: spec.notes ?? 'False positive — manager review',
        })
        .where(
          and(
            eq(schema.complianceFlags.playerId, redemption.playerId),
            eq(schema.complianceFlags.flagType, 'aml_watchlist'),
            isNull(schema.complianceFlags.clearedAt),
          ),
        )
      // 2) move redemption back into review
      await ctx.db
        .update(schema.redemptions)
        .set({ status: 'pending_review', updatedAt: new Date() })
        .where(eq(schema.redemptions.id, redemption.id))
      // 3) close out the AML review queue row
      await closeAmlReviewQueue(ctx, redemption.playerId, 'cleared', adminId, spec.notes)
      break
    }

    case 'confirm_hold': {
      // Flag stays open; redemption stays in aml_hold. We just close out the
      // queue entry so the manager queue clears.
      await closeAmlReviewQueue(ctx, redemption.playerId, 'hold_confirmed', adminId, spec.notes)
      break
    }

    case 'escalate': {
      await ctx.db
        .update(schema.players)
        .set({
          status: 'suspended',
          statusReason: 'AML escalation',
          updatedAt: new Date(),
        })
        .where(eq(schema.players.id, redemption.playerId))
      await closeAmlReviewQueue(ctx, redemption.playerId, 'escalated_legal', adminId, spec.notes)
      break
    }
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: role,
    action: `aml_hold.${spec.action}`,
    resourceKind: 'redemption',
    resourceId: redemption.id,
    before: { status: redemption.status },
    reason: spec.notes ?? null,
    ip: ctx.actor.ip,
  })

  await recordPlayerEvent(ctx.db, {
    playerId: redemption.playerId,
    eventName: `player.aml.${spec.action}`,
    eventCategory: 'compliance',
    payload: { redemption_id: redemption.id, admin_id: adminId },
  })

  await publishEvent(`private-player-${redemption.playerId}`, 'redemption-update', {
    redemptionId: redemption.id,
    status: spec.action === 'clear' ? 'pending_review' : redemption.status,
  })

  const fresh = await loadRedemption(ctx, redemption.id)
  if (!fresh) return err({ code: 'NOT_FOUND' })
  return ok(fresh)
}

async function closeAmlReviewQueue(
  ctx: Context,
  playerId: string,
  status: 'cleared' | 'hold_confirmed' | 'escalated_legal',
  adminId: string,
  notes: string | null | undefined,
): Promise<void> {
  await ctx.db
    .update(schema.amlReviewQueue)
    .set({
      status,
      resolvedAt: new Date(),
      resolvedBy: adminId,
      resolutionNotes: notes ?? null,
    })
    .where(
      and(eq(schema.amlReviewQueue.playerId, playerId), eq(schema.amlReviewQueue.status, 'open')),
    )
}
