import { and, eq, isNotNull, lt, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { recordPlayerEvent } from '../events/index'
import { write as ledgerWrite } from '../ledger/write'
import type { TransactionSpec } from '../ledger/types'
import { publishEvent } from '../realtime/pusher'

// docs/06 §9 — hourly expiry job. Walks `bonuses_awarded` for rows past
// their expires_at with playthrough still outstanding, claws back any
// remaining bonus SC, and marks the row as `expired`.

export interface ExpireBonusesResult {
  processed: number
  clawedBackAwards: number
  totalClawbackSc: bigint
}

export async function expireBonuses(
  ctx: Context,
  options: { limit?: number; now?: Date } = {},
): Promise<ExpireBonusesResult> {
  const cutoff = options.now ?? new Date()
  const limit = options.limit ?? 200

  const rows = await ctx.db
    .select({
      id: schema.bonusesAwarded.id,
      playerId: schema.bonusesAwarded.playerId,
      bonusId: schema.bonusesAwarded.bonusId,
      scAmount: schema.bonusesAwarded.scAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      expiresAt: schema.bonusesAwarded.expiresAt,
    })
    .from(schema.bonusesAwarded)
    .where(
      and(
        eq(schema.bonusesAwarded.status, 'active'),
        eq(schema.bonusesAwarded.playthroughComplete, false),
        isNotNull(schema.bonusesAwarded.expiresAt),
        lt(schema.bonusesAwarded.expiresAt, cutoff),
      ),
    )
    .limit(limit)

  let clawedBackAwards = 0
  let totalClawbackSc = 0n

  for (const award of rows) {
    const walletRows = await ctx.db
      .select({ balanceBonus: schema.wallets.balanceBonus })
      .from(schema.wallets)
      .where(and(eq(schema.wallets.playerId, award.playerId), eq(schema.wallets.currency, 'SC')))
      .limit(1)
    const wallet = walletRows[0]
    if (!wallet) {
      // Defensive: should never happen; mark expired so we don't loop.
      await ctx.db
        .update(schema.bonusesAwarded)
        .set({ status: 'expired', completedAt: cutoff })
        .where(eq(schema.bonusesAwarded.id, award.id))
      continue
    }

    const clawback = award.scAmount <= wallet.balanceBonus ? award.scAmount : wallet.balanceBonus

    if (clawback > 0n) {
      const spec: TransactionSpec = {
        source: 'bonus_expired',
        sourceId: award.id,
        playerId: award.playerId,
        entries: [
          {
            leg: 'debit',
            accountKind: 'player_wallet',
            amount: clawback,
            currency: 'SC',
            playerId: award.playerId,
            subBucket: 'bonus',
          },
          {
            leg: 'credit',
            accountKind: 'bonus_pool_sc',
            amount: clawback,
            currency: 'SC',
          },
        ],
        metadata: {
          bonus_award_id: award.id,
          bonus_id: award.bonusId,
          reason: 'bonus_expired',
        },
      }
      const result = await ledgerWrite(ctx, spec)
      if (!result.ok) {
        ctx.logger.error('expire_bonus_ledger_failed', { awardId: award.id, error: result.error })
        continue
      }
      clawedBackAwards += 1
      totalClawbackSc += clawback
    }

    // Decrement wallet playthrough rollups by the OUTSTANDING amount only.
    const outstanding = award.playthroughRequired - award.playthroughProgress
    if (outstanding > 0n) {
      await ctx.db
        .update(schema.wallets)
        .set({
          playthroughRequired: sql`greatest(${schema.wallets.playthroughRequired} - ${outstanding.toString()}::numeric(20,4), 0)`,
          updatedAt: cutoff,
        })
        .where(and(eq(schema.wallets.playerId, award.playerId), eq(schema.wallets.currency, 'SC')))
    }

    await ctx.db
      .update(schema.bonusesAwarded)
      .set({ status: 'expired', completedAt: cutoff })
      .where(eq(schema.bonusesAwarded.id, award.id))

    await writeAuditEntry(ctx.db, {
      actorKind: 'system',
      action: 'bonus.expired',
      resourceKind: 'bonus_award',
      resourceId: award.id,
      metadata: {
        bonus_award_id: award.id,
        clawback_sc: clawback.toString(),
        outstanding_playthrough: outstanding.toString(),
      },
    })

    await recordPlayerEvent(ctx.db, {
      playerId: award.playerId,
      eventName: 'player.bonus.expired',
      eventCategory: 'bonus',
      payload: {
        bonus_award_id: award.id,
        clawback_sc: clawback.toString(),
      },
      amount: clawback,
      currency: 'SC',
    })

    ctx.afterCommit(async () => {
      await publishEvent(`private-player-${award.playerId}`, 'bonus-expired', {
        bonusAwardId: award.id,
        clawback: clawback.toString(),
      })
    })
  }

  return {
    processed: rows.length,
    clawedBackAwards,
    totalClawbackSc,
  }
}
