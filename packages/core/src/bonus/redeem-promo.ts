import { and, eq, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { award } from './engine'
import type { AwardContext, AwardError, AwardResult } from './types'

// docs/06 §12 — promo-code redemption. Validates the code, then runs the
// linked bonus template through `award()` with promo-level overrides.

export type PromoContext = 'signup' | 'purchase' | 'standalone'

export interface RedeemPromoSpec {
  playerId: string
  code: string
  /** Where the code is being entered. Some codes require a specific context. */
  context: PromoContext
  /** Forward to the award engine for `pct_of_purchase` formulas. */
  awardContext?: AwardContext
}

export type RedeemPromoError =
  | { code: 'CODE_NOT_FOUND' }
  | { code: 'CODE_INACTIVE' }
  | { code: 'CODE_NOT_YET_VALID' }
  | { code: 'CODE_EXPIRED' }
  | { code: 'CODE_USAGE_EXCEEDED' }
  | { code: 'PLAYER_CODE_USAGE_EXCEEDED' }
  | { code: 'CODE_REQUIRES_CONTEXT'; expected: string }
  | { code: 'BLOCKED_DOMAIN' }
  | { code: 'BLOCKED_CODE' }
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'AWARD_FAILED'; error: AwardError }

export interface RedeemPromoResult {
  awardId: string
  awardStatus: AwardResult['status']
  promoCodeId: string
  bonusId: string
  /** Awarded GC in minor units (0n when the award was deduped). */
  gcAmount: bigint
  /** Awarded SC in minor units (0n when the award was deduped). */
  scAmount: bigint
}

export async function redeemPromoCode(
  ctx: Context,
  spec: RedeemPromoSpec,
): Promise<Result<RedeemPromoResult, RedeemPromoError>> {
  const codeUpper = spec.code.trim().toUpperCase()
  if (!codeUpper) return err({ code: 'CODE_NOT_FOUND' as const })

  // 1. Find the promo code (case-insensitive).
  const promoRows = await ctx.db
    .select({
      id: schema.promoCodes.id,
      code: schema.promoCodes.code,
      bonusId: schema.promoCodes.bonusId,
      playthroughMultiplier: schema.promoCodes.playthroughMultiplier,
      playthroughWindowHours: schema.promoCodes.playthroughWindowHours,
      requiredContext: schema.promoCodes.requiredContext,
      maxPerPlayer: schema.promoCodes.maxPerPlayer,
      maxTotalUses: schema.promoCodes.maxTotalUses,
      usesCount: schema.promoCodes.usesCount,
      status: schema.promoCodes.status,
      validFrom: schema.promoCodes.validFrom,
      validUntil: schema.promoCodes.validUntil,
      blockedEmailDomains: schema.promoCodes.blockedEmailDomains,
    })
    .from(schema.promoCodes)
    .where(sql`upper(${schema.promoCodes.code}) = ${codeUpper}`)
    .limit(1)
  const promo = promoRows[0]
  if (!promo) return err({ code: 'CODE_NOT_FOUND' as const })

  // 1a. Hard block list takes precedence over status.
  const blocked = await ctx.db
    .select({ code: schema.blockedPromoCodes.code })
    .from(schema.blockedPromoCodes)
    .where(eq(schema.blockedPromoCodes.code, promo.code))
    .limit(1)
  if (blocked[0]) return err({ code: 'BLOCKED_CODE' as const })

  // 2. Status + validity window.
  if (promo.status !== 'active') return err({ code: 'CODE_INACTIVE' as const })
  const now = new Date()
  if (promo.validFrom && now < promo.validFrom) {
    return err({ code: 'CODE_NOT_YET_VALID' as const })
  }
  if (promo.validUntil && now > promo.validUntil) {
    return err({ code: 'CODE_EXPIRED' as const })
  }

  // 3. Usage caps.
  if (promo.maxTotalUses && promo.usesCount >= promo.maxTotalUses) {
    return err({ code: 'CODE_USAGE_EXCEEDED' as const })
  }
  if (promo.maxPerPlayer) {
    const used = await ctx.db
      .select({ id: schema.promoRedemptions.id })
      .from(schema.promoRedemptions)
      .where(
        and(
          eq(schema.promoRedemptions.promoCodeId, promo.id),
          eq(schema.promoRedemptions.playerId, spec.playerId),
        ),
      )
    if (used.length >= promo.maxPerPlayer) {
      return err({ code: 'PLAYER_CODE_USAGE_EXCEEDED' as const })
    }
  }

  // 4. Context check (per docs/06 §12 step 5).
  if (promo.requiredContext && promo.requiredContext !== spec.context) {
    return err({ code: 'CODE_REQUIRES_CONTEXT' as const, expected: promo.requiredContext })
  }

  // 5. Per-code email-domain blocklist (anti-abuse).
  const playerRows = await ctx.db
    .select({ email: schema.players.email })
    .from(schema.players)
    .where(eq(schema.players.id, spec.playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player) return err({ code: 'PLAYER_NOT_FOUND' as const })
  const domain = (player.email.split('@')[1] ?? '').toLowerCase()
  if (
    domain &&
    Array.isArray(promo.blockedEmailDomains) &&
    promo.blockedEmailDomains.some((d) => d.toLowerCase() === domain)
  ) {
    return err({ code: 'BLOCKED_DOMAIN' as const })
  }
  // Global blocked-domain list (anti-throwaway).
  const globalBlocked = await ctx.db
    .select({ domain: schema.blockedDomains.domain })
    .from(schema.blockedDomains)
    .where(eq(schema.blockedDomains.domain, domain))
    .limit(1)
  if (globalBlocked[0]) return err({ code: 'BLOCKED_DOMAIN' as const })

  // 6. Run the award path with promo-level overrides. docs/06 §12 step 7.
  const awardResult = await award(ctx, {
    playerId: spec.playerId,
    bonusId: promo.bonusId,
    sourceKind: 'promo_code',
    sourceId: promo.id,
    playthroughMultiplierOverride:
      promo.playthroughMultiplier != null ? Number(promo.playthroughMultiplier) : undefined,
    playthroughWindowOverride:
      promo.playthroughWindowHours != null ? promo.playthroughWindowHours : undefined,
    subBucketOverride: 'promo',
    reason: `Promo code: ${promo.code}`,
    context: spec.awardContext,
  })

  if (!awardResult.ok) {
    return err({ code: 'AWARD_FAILED' as const, error: awardResult.error })
  }

  // 7. Record the redemption + bump global use count. The redemptions table
  // has a UNIQUE(promo_code_id, player_id) so we tolerate the case where the
  // bonus engine returned 'duplicate'.
  if (awardResult.value.status === 'awarded') {
    await ctx.db.insert(schema.promoRedemptions).values({
      promoCodeId: promo.id,
      playerId: spec.playerId,
      bonusAwardId: awardResult.value.awardId,
      context: spec.context,
      redeemedAt: now,
    })
    await ctx.db
      .update(schema.promoCodes)
      .set({
        usesCount: sql`${schema.promoCodes.usesCount} + 1`,
        updatedAt: now,
      })
      .where(eq(schema.promoCodes.id, promo.id))
  }

  return ok({
    awardId: awardResult.value.awardId,
    awardStatus: awardResult.value.status,
    promoCodeId: promo.id,
    bonusId: promo.bonusId,
    // Surface the awarded amounts so the player-facing API can drive a
    // celebration view. These are already computed inside `award()` —
    // we're just propagating them. Both are bigint minor units; the
    // caller serialises to string for transport.
    gcAmount: awardResult.value.status === 'awarded' ? awardResult.value.gcAmount : 0n,
    scAmount: awardResult.value.status === 'awarded' ? awardResult.value.scAmount : 0n,
  })
}
