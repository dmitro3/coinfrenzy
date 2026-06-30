import { and, eq, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'

// docs/06 §13 (pending claim extension) — list the player's pending
// bonus awards, newest first, for the Available Rewards popover.
//
// We join `bonuses` so the popover can render the display name, type,
// and (later) the configured display image without an extra round trip.

export interface PendingBonusRow {
  awardId: string
  bonusId: string
  bonusSlug: string
  bonusName: string
  bonusType: string
  gcAmount: bigint
  scAmount: bigint
  playthroughMultiplier: number
  playthroughRequired: bigint
  sourceKind: string | null
  sourceId: string | null
  awardReason: string | null
  awardedByAdmin: string | null
  createdAt: Date
  /** When the bonus would expire if claimed now; null = no expiry. */
  expiresAt: Date | null
}

/**
 * Read-only list of pending bonus awards for a single player. Cheap —
 * indexed by `bonuses_awarded_pending_idx`. Hit on every popover open,
 * so do not add JOINs without thinking about it.
 */
export async function listPendingBonuses(
  ctx: Context,
  playerId: string,
): Promise<PendingBonusRow[]> {
  const rows = await ctx.db
    .select({
      awardId: schema.bonusesAwarded.id,
      bonusId: schema.bonusesAwarded.bonusId,
      bonusSlug: schema.bonuses.slug,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      gcAmount: schema.bonusesAwarded.gcAmount,
      scAmount: schema.bonusesAwarded.scAmount,
      playthroughMultiplier: schema.bonusesAwarded.playthroughMultiplierSnapshot,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      sourceKind: schema.bonusesAwarded.sourceKind,
      sourceId: schema.bonusesAwarded.sourceId,
      awardReason: schema.bonusesAwarded.awardReason,
      awardedByAdmin: schema.bonusesAwarded.awardedByAdmin,
      createdAt: schema.bonusesAwarded.createdAt,
      expiresAt: schema.bonusesAwarded.expiresAt,
    })
    .from(schema.bonusesAwarded)
    .innerJoin(schema.bonuses, eq(schema.bonusesAwarded.bonusId, schema.bonuses.id))
    .where(
      and(
        eq(schema.bonusesAwarded.playerId, playerId),
        eq(schema.bonusesAwarded.status, 'pending'),
      ),
    )
    .orderBy(sql`${schema.bonusesAwarded.createdAt} desc`)

  return rows.map((r) => ({
    awardId: r.awardId,
    bonusId: r.bonusId,
    bonusSlug: r.bonusSlug,
    bonusName: r.bonusName,
    bonusType: r.bonusType,
    gcAmount: BigInt(r.gcAmount as unknown as string),
    scAmount: BigInt(r.scAmount as unknown as string),
    playthroughMultiplier: Number(r.playthroughMultiplier),
    playthroughRequired: BigInt(r.playthroughRequired as unknown as string),
    sourceKind: r.sourceKind,
    sourceId: r.sourceId,
    awardReason: r.awardReason,
    awardedByAdmin: r.awardedByAdmin,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }))
}
