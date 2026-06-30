import { and, eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'

import { award } from './engine'
import type { AwardContext, AwardError, AwardResult, BonusAwardSourceKind } from './types'
import { err, ok, type Result } from '../errors/result'

// docs/06 §13 — trigger taxonomy.
//
// Well-known slugs for the singleton templates that the trigger sites need
// to resolve. These are the slugs the seed migration creates. Operators can
// edit the templates' configuration (amounts, multiplier, window) freely —
// the slug is the stable handle that code uses to find them.

export const BONUS_SLUGS = {
  welcome: 'welcome_default',
  daily: 'daily_login',
  amoe: 'amoe_default',
  tierUp: 'tier_up_default',
  weeklyTier: 'weekly_tier_default',
  monthlyTier: 'monthly_tier_default',
  jackpot: 'jackpot_default',
  referral: 'referral_default',
  // Pending-claim feeders — see docs/06 §13. The player has to claim
  // these from the Available Rewards popover (pendingClaim: true on
  // the AwardSpec); the engine writes the row but defers the ledger.
  affiliatePayout: 'affiliate_payout_default',
  adminGrant: 'admin_grant_default',
} as const

/**
 * Resolve a bonus template id by slug. Returns null if the operator has
 * disabled or deleted the template — callers should treat null as "no
 * bonus to award" rather than an error.
 */
export async function findBonusBySlug(ctx: Context, slug: string): Promise<string | null> {
  const rows = await ctx.db
    .select({ id: schema.bonuses.id })
    .from(schema.bonuses)
    .where(and(eq(schema.bonuses.slug, slug), eq(schema.bonuses.status, 'active')))
    .limit(1)
  return rows[0]?.id ?? null
}

interface TriggerInput {
  playerId: string
  sourceKind: BonusAwardSourceKind
  sourceId: string
  context?: AwardContext
  reason?: string
  adminId?: string | null
  /** Forwarded to AwardSpec — see docs/06 §13 pending-claim extension. */
  pendingClaim?: boolean
}

/**
 * Slug-keyed wrapper around `award`. The trigger sites use this so they
 * don't have to look up the template themselves; returns a typed 'noop'
 * when the slug is disabled.
 */
export async function awardBySlug(
  ctx: Context,
  slug: string,
  input: TriggerInput,
): Promise<Result<AwardResult, AwardError | { code: 'TEMPLATE_DISABLED' }>> {
  const bonusId = await findBonusBySlug(ctx, slug)
  if (!bonusId) {
    return err({ code: 'TEMPLATE_DISABLED' as const })
  }
  const result = await award(ctx, {
    playerId: input.playerId,
    bonusId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    context: input.context,
    reason: input.reason,
    adminId: input.adminId,
    pendingClaim: input.pendingClaim,
  })
  if (!result.ok) return err(result.error)
  return ok(result.value)
}
