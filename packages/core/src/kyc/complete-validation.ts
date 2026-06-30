import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import { getFootprintClient } from '../adapters/footprint/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'
import { processPendingRedemptionsAwaitingKyc } from '../redemption/progress-kyc-pending'
import { publishEvent } from '../realtime/pusher'

// docs/07 §6.3 — exchange the validation token returned by the Footprint
// frontend SDK for the verified status, then update kyc_status + players +
// progress any kyc_pending redemptions.
//
// The async webhook path (footprint.onboarding.completed) does the same
// thing — both routes are idempotent on the kyc_status row + the redemption
// ledger writes.

export interface CompleteSpec {
  playerId: string
  /** Validation token from Footprint's onComplete callback. */
  validationToken: string
}

export interface CompleteResult {
  footprintStatus: string
  kycLevel: number
  /** True when the validation is already terminal (pass/fail). */
  terminal: boolean
}

export type CompleteError =
  | { code: 'KYC_RECORD_NOT_FOUND' }
  | { code: 'KYC_PLAYER_MISMATCH' }
  | { code: 'ADAPTER_ERROR'; reason: string }

export async function completeKycValidation(
  ctx: Context,
  spec: CompleteSpec,
): Promise<Result<CompleteResult, CompleteError>> {
  const client = getFootprintClient()

  // ─────────────────────────────────────────────────────────────────────
  // Real Footprint exchanges the token via /onboarding/session/validate.
  // The mock client doesn't expose that, so we resolve the kyc_status row
  // by player_id and then fetch the (mock-stored) status.
  // ─────────────────────────────────────────────────────────────────────
  const kycRows = await ctx.db
    .select({
      id: schema.kycStatus.id,
      playerId: schema.kycStatus.playerId,
      footprintUserId: schema.kycStatus.footprintUserId,
    })
    .from(schema.kycStatus)
    .where(eq(schema.kycStatus.playerId, spec.playerId))
    .limit(1)

  const kycRow = kycRows[0]
  if (!kycRow) return err({ code: 'KYC_RECORD_NOT_FOUND' })
  if (kycRow.playerId !== spec.playerId) return err({ code: 'KYC_PLAYER_MISMATCH' })
  if (!kycRow.footprintUserId) return err({ code: 'KYC_RECORD_NOT_FOUND' })

  let status: 'pass' | 'fail' | 'none' | 'pending'
  try {
    const fp = await client.getUser(kycRow.footprintUserId)
    status = fp.status
  } catch (e) {
    return err({
      code: 'ADAPTER_ERROR',
      reason: e instanceof Error ? e.message : String(e),
    })
  }

  const mapped = mapStatus(status)
  const completedAt = status === 'pending' ? null : new Date()

  await ctx.db
    .update(schema.kycStatus)
    .set({
      footprintStatus: mapped.footprintStatus,
      footprintCompletedAt: completedAt,
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
    .where(eq(schema.players.id, spec.playerId))

  // Auto-progress any kyc_pending redemptions if we just verified.
  if (status === 'pass') {
    await processPendingRedemptionsAwaitingKyc(ctx, spec.playerId)
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'player',
    actorId: spec.playerId,
    action: 'kyc.validation_completed',
    resourceKind: 'player',
    resourceId: spec.playerId,
    after: { footprint_status: mapped.footprintStatus, kyc_level: mapped.kycLevel },
    metadata: { fp_id: kycRow.footprintUserId, mode: client.mode },
  })

  await recordPlayerEvent(ctx.db, {
    playerId: spec.playerId,
    eventName:
      status === 'pass'
        ? 'player.kyc.verified'
        : status === 'fail'
          ? 'player.kyc.failed'
          : 'player.kyc.pending',
    eventCategory: 'kyc',
    payload: { footprint_status: mapped.footprintStatus, validation_token: spec.validationToken },
  })

  await publishEvent(`private-player-${spec.playerId}`, 'kyc-update', {
    status: mapped.footprintStatus,
    level: mapped.kycLevel,
  })

  return ok({
    footprintStatus: mapped.footprintStatus,
    kycLevel: mapped.kycLevel,
    terminal: status === 'pass' || status === 'fail',
  })
}

function mapStatus(status: 'pass' | 'fail' | 'none' | 'pending'): {
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
      return { kycLevel: 0, footprintStatus: 'pending' }
  }
}
