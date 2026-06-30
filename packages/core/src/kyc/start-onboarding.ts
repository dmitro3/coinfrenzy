import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import { getFootprintClient } from '../adapters/footprint/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'

// docs/07 §6 — start a Footprint onboarding session.
//
// Idempotent: if the player already has a `kyc_status` row with a Footprint
// user id, we re-use it and request a fresh onboarding token. The mock
// adapter creates a new fp_id every call (it's process-local store); the
// real adapter would dedupe upstream.

export interface StartOnboardingSpec {
  playerId: string
  email: string
  prefill?: {
    first_name?: string
    last_name?: string
    dob?: string
    phone_number?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  /** Where to send the player after the hosted flow (e.g. /account/kyc?status=completed). */
  returnUrl?: string
}

export interface StartOnboardingResult {
  footprintUserId: string
  validationToken: string
  url: string
  /** True when running in mock mode (the URL points at /mock-vendors/footprint). */
  stubbed: boolean
}

export type StartOnboardingError =
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'ADAPTER_ERROR'; reason: string }

export async function startKycOnboarding(
  ctx: Context,
  spec: StartOnboardingSpec,
): Promise<Result<StartOnboardingResult, StartOnboardingError>> {
  const playerRows = await ctx.db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      kycLevel: schema.players.kycLevel,
    })
    .from(schema.players)
    .where(eq(schema.players.id, spec.playerId))
    .limit(1)
  if (playerRows.length === 0) return err({ code: 'PLAYER_NOT_FOUND' })

  const client = getFootprintClient()

  let result
  try {
    result = await client.createOnboardingSession({
      playerId: spec.playerId,
      email: spec.email,
      prefill: spec.prefill,
      returnUrl: spec.returnUrl,
    })
  } catch (e) {
    ctx.logger.error('ADAPTER_ERROR:::>>>', { error: JSON.stringify(e) })
    return err({
      code: 'ADAPTER_ERROR',
      reason: String(e),
    })
  }

  // Upsert kyc_status. The unique on player_id makes this safe to retry.
  const existing = await ctx.db
    .select({ id: schema.kycStatus.id, footprintStatus: schema.kycStatus.footprintStatus })
    .from(schema.kycStatus)
    .where(eq(schema.kycStatus.playerId, spec.playerId))
    .limit(1)

  if (existing.length === 0) {
    await ctx.db.insert(schema.kycStatus).values({
      playerId: spec.playerId,
      footprintUserId: result.footprintUserId,
      footprintStatus: 'pending',
    })
  } else {
    await ctx.db
      .update(schema.kycStatus)
      .set({
        footprintUserId: result.footprintUserId,
        footprintStatus: existing[0]!.footprintStatus ?? 'pending',
        updatedAt: new Date(),
      })
      .where(eq(schema.kycStatus.playerId, spec.playerId))
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'player',
    actorId: spec.playerId,
    action: 'kyc.onboarding_started',
    resourceKind: 'player',
    resourceId: spec.playerId,
    metadata: { mode: client.mode, fp_id: result.footprintUserId },
  })

  await recordPlayerEvent(ctx.db, {
    playerId: spec.playerId,
    eventName: 'player.kyc.started',
    eventCategory: 'kyc',
    payload: { mode: client.mode },
  })

  return ok({
    footprintUserId: result.footprintUserId,
    validationToken: result.validationToken,
    url: result.url,
    stubbed: client.mode === 'mock',
  })
}
