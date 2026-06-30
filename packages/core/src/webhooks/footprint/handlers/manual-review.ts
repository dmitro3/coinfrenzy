import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { getFootprintClient } from '../../../adapters/footprint/index'

// docs/05 §4.4 — manual review. The webhook itself only carries the fp_id;
// we must fetch the new status from Footprint's API. Mock mode returns the
// in-memory state via the mock client.

interface FootprintManualReviewPayload {
  id: string
  type: string
  data: { fp_id: string }
}

export async function handleFootprintManualReview(
  ctx: Context,
  payload: FootprintManualReviewPayload,
): Promise<void> {
  const fpId = payload.data.fp_id

  const kycRows = await ctx.db
    .select({ id: schema.kycStatus.id, playerId: schema.kycStatus.playerId })
    .from(schema.kycStatus)
    .where(eq(schema.kycStatus.footprintUserId, fpId))
    .limit(1)
  const kycRow = kycRows[0]
  if (!kycRow) return

  const remote = await getFootprintClient().getUser(fpId)

  await ctx.db
    .update(schema.kycStatus)
    .set({
      footprintManualReviewStatus: remote.manualReviewStatus,
      footprintStatusLastSynced: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.kycStatus.id, kycRow.id))

  if (remote.manualReviewStatus === 'approved') {
    await ctx.db
      .update(schema.players)
      .set({ kycLevel: 2, kycVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.players.id, kycRow.playerId))
  } else if (remote.manualReviewStatus === 'denied') {
    await ctx.db
      .update(schema.players)
      .set({ kycLevel: 0, kycVerifiedAt: null, updatedAt: new Date() })
      .where(eq(schema.players.id, kycRow.playerId))

    await ctx.db.insert(schema.complianceFlags).values({
      playerId: kycRow.playerId,
      flagType: 'kyc_failed',
      severity: 'block',
      reason: 'KYC manual review denied',
      metadata: { fp_id: fpId },
    })
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'kyc.manual_review_synced',
    resourceKind: 'player',
    resourceId: kycRow.playerId,
    after: { manual_review_status: remote.manualReviewStatus },
  })
}
