import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { recordPlayerEvent } from '../../../events/index'
import { publishEvent } from '../../../realtime/index'
import { processPendingRedemptionsAwaitingKyc } from '../../../redemption/progress-kyc-pending'

// docs/05 §4.4 — footprint.onboarding.completed. Map Footprint status to
// our kyc_level scale (0/2). The transaction wraps both writes so the
// player row + kyc row never get out of sync.

interface FootprintOnboardingPayload {
  id: string
  type: string
  data: {
    fp_id: string
    status: 'pass' | 'fail' | 'none' | 'pending'
    timestamp?: string
  }
}

export async function handleFootprintOnboardingCompleted(
  ctx: Context,
  payload: FootprintOnboardingPayload,
): Promise<void> {
  const { fp_id: fpId, status } = payload.data

  const kycRows = await ctx.db
    .select({ id: schema.kycStatus.id, playerId: schema.kycStatus.playerId })
    .from(schema.kycStatus)
    .where(eq(schema.kycStatus.footprintUserId, fpId))
    .limit(1)

  const kycRow = kycRows[0]
  if (!kycRow) {
    ctx.logger.error('footprint_unknown_fp_id', { fpId })
    return
  }

  const mapped = mapStatus(status)

  await ctx.db
    .update(schema.kycStatus)
    .set({
      footprintStatus: mapped.footprintStatus,
      footprintCompletedAt: new Date(),
      footprintStatusLastSynced: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.kycStatus.id, kycRow.id))

  await ctx.db
    .update(schema.players)
    .set({
      kycLevel: mapped.kycLevel,
      kycVerifiedAt: status === 'pass' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, kycRow.playerId))

  // docs/07 §6.5 — auto-progress any redemptions parked in kyc_pending now
  // that the player is verified. The function is no-op if there are none.
  if (status === 'pass') {
    await processPendingRedemptionsAwaitingKyc(ctx, kycRow.playerId)
  }

  // CRM event
  await recordPlayerEvent(ctx.db, {
    playerId: kycRow.playerId,
    eventName: status === 'pass' ? 'player.kyc.verified' : 'player.kyc.failed',
    eventCategory: 'kyc',
    payload: { footprint_status: status },
  })

  await publishEvent(`private-player-${kycRow.playerId}`, 'kyc-update', {
    status: mapped.footprintStatus,
    level: mapped.kycLevel,
  })

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'webhook.footprint.onboarding_completed',
    resourceKind: 'player',
    resourceId: kycRow.playerId,
    after: { kyc_status: mapped.footprintStatus, kyc_level: mapped.kycLevel },
    metadata: { fp_id: fpId, event_id: payload.id },
  })
}

function mapStatus(status: FootprintOnboardingPayload['data']['status']): {
  kycLevel: number
  footprintStatus: string
} {
  switch (status) {
    case 'pass':
      return { kycLevel: 2, footprintStatus: 'verified' }
    case 'fail':
      return { kycLevel: 0, footprintStatus: 'failed' }
    case 'none':
      return { kycLevel: 0, footprintStatus: 'incomplete' }
    case 'pending':
    default:
      return { kycLevel: 0, footprintStatus: 'pending' }
  }
}
