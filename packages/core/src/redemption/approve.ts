import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import { APPROVAL_THRESHOLDS, type AdminRoleSlug } from '../auth/permissions'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { loadRedemption } from './create'
import type { ApprovalError, RedemptionRecord } from './types'

// docs/07 §7.1 — approve a pending redemption (or AML-cleared one).
//
// Side effects:
//   - flips status -> 'approved'
//   - audit entry
//   - returns the updated record so the API route can fan out a Pusher push
//     and dispatch the Inngest finix-submit event from the calling context.
//     (We don't enqueue Inngest here so the core stays vendor-free; the
//     route layer owns the queue.)

export interface ApproveSpec {
  redemptionId: string
  /** Free-form note shown on the audit detail. */
  reason?: string | null
}

export async function approveRedemption(
  ctx: Context,
  spec: ApproveSpec,
): Promise<Result<RedemptionRecord, ApprovalError>> {
  if (ctx.actor.kind !== 'admin') {
    return err({ code: 'EXCEEDS_ROLE_LIMIT', maxUsd: 0 })
  }
  const role = ctx.actor.role as AdminRoleSlug
  const adminId = ctx.actor.adminId

  const redemption = await loadRedemption(ctx, spec.redemptionId)
  if (!redemption) return err({ code: 'NOT_FOUND' })
  if (!isApprovableState(redemption.status)) {
    return err({ code: 'INVALID_STATE', current: redemption.status })
  }

  // Role-bounded amount check (docs/09 §3 + permissions.ts table).
  const threshold =
    APPROVAL_THRESHOLDS.cashier_redemption_approve[
      role as keyof typeof APPROVAL_THRESHOLDS.cashier_redemption_approve
    ]
  if (!threshold) return err({ code: 'EXCEEDS_ROLE_LIMIT', maxUsd: 0 })

  const amountUsdMajor = Number(redemption.amountUsd / 10_000n)
  if (amountUsdMajor > threshold.max_usd) {
    return err({ code: 'EXCEEDS_ROLE_LIMIT', maxUsd: threshold.max_usd })
  }

  // AML-hold approvals require manager+ (the role table already enforces
  // the dollar limit; we add the role gate as an extra belt-and-braces).
  if (redemption.status === 'aml_hold' && !(role === 'manager' || role === 'master')) {
    return err({ code: 'AML_HOLD_REQUIRES_MANAGER' })
  }

  await ctx.db
    .update(schema.redemptions)
    .set({
      status: 'approved',
      approvedBy: adminId,
      approvedAt: new Date(),
      approvalReason: spec.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.redemptions.id, redemption.id))

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: adminId,
    actorRole: role,
    action: redemption.status === 'aml_hold' ? 'redemption.aml_cleared' : 'redemption.approved',
    resourceKind: 'redemption',
    resourceId: redemption.id,
    before: { status: redemption.status },
    after: { status: 'approved' },
    reason: spec.reason ?? null,
    ip: ctx.actor.ip,
  })

  const fresh = await loadRedemption(ctx, redemption.id)
  if (!fresh) return err({ code: 'NOT_FOUND' })
  return ok(fresh)
}

function isApprovableState(status: string): boolean {
  return status === 'pending_review' || status === 'aml_hold'
}
