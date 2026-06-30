import { and, eq, inArray } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'

// docs/05 §4.4 + docs/07 §7.3 — AML continuous monitoring fail. A `fail`
// status triggers the "block redemption + manager review" path:
//   1. compliance_flag: aml_watchlist, severity=block, scope=redemption_only
//   2. any pending redemptions move to status='aml_hold'
//   3. aml_review_queue row inserted for the Manager-tier UI

interface WatchlistCheckPayload {
  id: string
  type: string
  data: {
    fp_id: string
    status: 'pass' | 'fail'
    timestamp?: string
  }
}

export async function handleFootprintWatchlistCheck(
  ctx: Context,
  payload: WatchlistCheckPayload,
): Promise<void> {
  const { fp_id: fpId, status } = payload.data

  const kycRows = await ctx.db
    .select({ id: schema.kycStatus.id, playerId: schema.kycStatus.playerId })
    .from(schema.kycStatus)
    .where(eq(schema.kycStatus.footprintUserId, fpId))
    .limit(1)
  const kycRow = kycRows[0]
  if (!kycRow) return

  await ctx.db
    .update(schema.kycStatus)
    .set({
      watchlistLastCheckAt: new Date(),
      watchlistLastStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(schema.kycStatus.id, kycRow.id))

  if (status !== 'fail') return

  await ctx.db.insert(schema.complianceFlags).values({
    playerId: kycRow.playerId,
    flagType: 'aml_watchlist',
    severity: 'block',
    reason: 'AML watchlist hit detected during continuous monitoring',
    metadata: {
      scope: 'redemption_only',
      footprint_checked_at: payload.data.timestamp,
    },
  })

  await ctx.db
    .update(schema.redemptions)
    .set({ status: 'aml_hold', updatedAt: new Date() })
    .where(
      and(
        eq(schema.redemptions.playerId, kycRow.playerId),
        inArray(schema.redemptions.status, ['pending_review', 'kyc_pending']),
      ),
    )

  await ctx.db.insert(schema.amlReviewQueue).values({
    playerId: kycRow.playerId,
    footprintEventId: payload.id,
    status: 'open',
  })

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'aml_watchlist.flagged',
    resourceKind: 'player',
    resourceId: kycRow.playerId,
    metadata: { fp_id: fpId, event_id: payload.id },
  })
}
