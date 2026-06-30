import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'
import { write as ledgerWrite } from '../ledger/write'
import { buildPlaythroughRelease } from '../ledger/transactions/playthrough-release'
import { publishEvent } from '../realtime/pusher'
import { recordPlayerEvent } from '../events/index'
import { writeAuditEntry } from '../audit/index'

import { applyWeightToAmount, computeGameWeight, type GameForWeight } from './game-weight'
import type { BetSpec, RecordBetResult } from './types'

// docs/06 §6 — every Alea round.bet event flows through here. Hot path.

export async function recordBet(ctx: Context, spec: BetSpec): Promise<RecordBetResult> {
  const out: RecordBetResult = { contributed: [], skipped: [], released: [] }

  // docs/06 §6 — GC bets do not contribute to SC playthrough. The wallet
  // playthrough column is also SC-only by construction (wallets are
  // single-currency rows).
  if (spec.currency !== 'SC') return out

  const activeAwards = await ctx.db
    .select({
      id: schema.bonusesAwarded.id,
      bonusId: schema.bonusesAwarded.bonusId,
      scAmount: schema.bonusesAwarded.scAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      gameWeightOverridesSnapshot: schema.bonusesAwarded.gameWeightOverridesSnapshot,
      minBetForContributionSnapshot: schema.bonusesAwarded.minBetForContributionSnapshot,
      maxBetDuringPlaythroughSnapshot: schema.bonusesAwarded.maxBetDuringPlaythroughSnapshot,
    })
    .from(schema.bonusesAwarded)
    .where(
      and(
        eq(schema.bonusesAwarded.playerId, spec.playerId),
        eq(schema.bonusesAwarded.status, 'active'),
        eq(schema.bonusesAwarded.playthroughComplete, false),
      ),
    )
  if (activeAwards.length === 0) return out

  const gameRows = await ctx.db
    .select({
      id: schema.games.id,
      category: schema.games.category,
      playthroughWeight: schema.games.playthroughWeight,
    })
    .from(schema.games)
    .where(eq(schema.games.id, spec.gameId))
    .limit(1)
  const gameRow = gameRows[0]
  if (!gameRow) {
    ctx.logger.warn('playthrough_record_bet_game_missing', { gameId: spec.gameId })
    return out
  }
  const game: GameForWeight = {
    id: gameRow.id,
    category: gameRow.category,
    playthroughWeight: Number(gameRow.playthroughWeight ?? 1),
  }

  for (const award of activeAwards) {
    // docs/06 §15 attack 1 — min-bet floor.
    if (award.minBetForContributionSnapshot && spec.amount < award.minBetForContributionSnapshot) {
      out.skipped.push({ awardId: award.id, reason: 'min_bet' })
      continue
    }
    // docs/06 §15 attack 2 — bets above the cap don't progress playthrough,
    // and we flag for cashier review. The bet itself was already accepted by
    // Alea; we can't unwind it.
    if (
      award.maxBetDuringPlaythroughSnapshot &&
      spec.amount > award.maxBetDuringPlaythroughSnapshot
    ) {
      await ctx.db.insert(schema.complianceFlags).values({
        playerId: spec.playerId,
        flagType: 'fraud',
        severity: 'warn',
        reason: `Bet ${spec.amount.toString()} exceeds bonus max ${award.maxBetDuringPlaythroughSnapshot.toString()}`,
        metadata: {
          bonus_award_id: award.id,
          round_id: spec.roundId,
          bet_amount: spec.amount.toString(),
          max_bet: award.maxBetDuringPlaythroughSnapshot.toString(),
        },
      })
      out.skipped.push({ awardId: award.id, reason: 'max_bet_flagged' })
      continue
    }

    const weight = computeGameWeight(
      {
        gameWeightOverridesSnapshot: award.gameWeightOverridesSnapshot as Record<
          string,
          unknown
        > | null,
      },
      game,
    )
    if (weight === 0) {
      out.skipped.push({ awardId: award.id, reason: 'zero_weight' })
      continue
    }

    const contribution = applyWeightToAmount(spec.amount, weight)
    if (contribution === 0n) {
      out.skipped.push({ awardId: award.id, reason: 'zero_weight' })
      continue
    }

    const newProgressUncapped = award.playthroughProgress + contribution
    const isComplete = newProgressUncapped >= award.playthroughRequired
    const newProgress = isComplete ? award.playthroughRequired : newProgressUncapped
    // Effective contribution after capping at the required ceiling — used
    // both for the wallet rollup increment and the audit row.
    const effectiveContribution = newProgress - award.playthroughProgress

    await ctx.db
      .update(schema.bonusesAwarded)
      .set({
        playthroughProgress: newProgress,
        playthroughComplete: isComplete,
      })
      .where(eq(schema.bonusesAwarded.id, award.id))

    if (effectiveContribution > 0n) {
      await ctx.db
        .update(schema.wallets)
        .set({
          playthroughProgress: sql`${schema.wallets.playthroughProgress} + ${effectiveContribution.toString()}::numeric(20,4)`,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.wallets.playerId, spec.playerId), eq(schema.wallets.currency, 'SC')))
    }

    out.contributed.push({
      awardId: award.id,
      contribution: effectiveContribution,
      newProgress,
      required: award.playthroughRequired,
      completed: isComplete,
    })

    if (isComplete) {
      const released = await releasePlaythrough(ctx, award.id)
      if (released) out.released.push(award.id)
    }
  }

  return out
}

// docs/06 §8 / docs/04 §3.5 — release transaction. Moves SC from the bonus
// sub-bucket to the earned sub-bucket on the same wallet, writes a ledger
// pair so the audit trail captures the exact moment the SC became
// redeemable (vs a silent UPDATE).
export async function releasePlaythrough(ctx: Context, awardId: string): Promise<boolean> {
  const rows = await ctx.db
    .select({
      id: schema.bonusesAwarded.id,
      playerId: schema.bonusesAwarded.playerId,
      scAmount: schema.bonusesAwarded.scAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      status: schema.bonusesAwarded.status,
      bonusId: schema.bonusesAwarded.bonusId,
    })
    .from(schema.bonusesAwarded)
    .where(eq(schema.bonusesAwarded.id, awardId))
    .limit(1)
  const award = rows[0]
  if (!award) return false
  if (award.status !== 'active') return false
  if (award.scAmount <= 0n) {
    // GC-only bonus — flip status to completed without ledger movement.
    await ctx.db
      .update(schema.bonusesAwarded)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.bonusesAwarded.id, awardId))
    return true
  }

  const walletRows = await ctx.db
    .select({
      balanceBonus: schema.wallets.balanceBonus,
      balancePromo: schema.wallets.balancePromo,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, award.playerId), eq(schema.wallets.currency, 'SC')))
    .limit(1)
  const wallet = walletRows[0]
  if (!wallet) {
    ctx.logger.error('playthrough_release_wallet_missing', { awardId, playerId: award.playerId })
    return false
  }

  // docs/06 §8 — release amount = min(remaining bucket, award.sc_amount).
  // Some of the bonus SC may have been spent during playthrough since bonus
  // drains LAST. The audit trail still recorded those debits.
  const fromBonus = award.scAmount <= wallet.balanceBonus ? award.scAmount : wallet.balanceBonus

  const releaseAmount = fromBonus
  let releasePairId: string | null = null

  if (releaseAmount > 0n) {
    const spec = buildPlaythroughRelease({
      bonusAwardId: award.id,
      playerId: award.playerId,
      currency: 'SC',
      amount: releaseAmount,
      fromSubBucket: 'bonus',
      metadata: {
        bonus_award_id: award.id,
        bonus_id: award.bonusId,
      },
    })
    const result = await ledgerWrite(ctx, spec)
    if (!result.ok) {
      ctx.logger.error('playthrough_release_ledger_failed', {
        awardId,
        error: result.error,
      })
      return false
    }
    if (result.value.status === 'written') releasePairId = result.value.pairId

    // The ledger.write moved the four bucket columns. The playthrough
    // rollups (different columns) are decremented separately.
    await ctx.db
      .update(schema.wallets)
      .set({
        playthroughRequired: sql`greatest(${schema.wallets.playthroughRequired} - ${award.playthroughRequired.toString()}::numeric(20,4), 0)`,
        playthroughProgress: sql`greatest(${schema.wallets.playthroughProgress} - ${award.playthroughProgress.toString()}::numeric(20,4), 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.wallets.playerId, award.playerId), eq(schema.wallets.currency, 'SC')))
  }

  await ctx.db
    .update(schema.bonusesAwarded)
    .set({
      status: 'completed',
      releasePairId,
      completedAt: new Date(),
    })
    .where(eq(schema.bonusesAwarded.id, awardId))

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'bonus.playthrough_released',
    resourceKind: 'bonus_award',
    resourceId: award.id,
    metadata: {
      bonus_award_id: award.id,
      release_amount: releaseAmount.toString(),
      release_pair_id: releasePairId,
    },
  })

  await recordPlayerEvent(ctx.db, {
    playerId: award.playerId,
    eventName: 'player.bonus.playthrough_completed',
    eventCategory: 'bonus',
    payload: {
      bonus_award_id: award.id,
      release_amount_sc: releaseAmount.toString(),
    },
    amount: releaseAmount,
    currency: 'SC',
  })

  ctx.afterCommit(async () => {
    await publishEvent(`private-player-${award.playerId}`, 'playthrough-released', {
      bonusAwardId: award.id,
      amount: releaseAmount.toString(),
    })
  })

  return true
}

/**
 * Append a `playthrough_contributions`-style audit row. Per docs/06 §6 the
 * actual table is optional; we persist the contribution to the audit_log
 * with action='bonus.playthrough_contribution' so the trail is queryable
 * without bloating ledger_entries.
 */
export async function recordContributionAudit(
  ctx: Context,
  spec: {
    roundId: string
    playerId: string
    contributions: Array<{ awardId: string; contribution: bigint }>
  },
): Promise<void> {
  if (spec.contributions.length === 0) return
  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'bonus.playthrough_contribution',
    resourceKind: 'game_round',
    resourceId: spec.roundId,
    metadata: {
      player_id: spec.playerId,
      contributions: spec.contributions.map((c) => ({
        bonus_award_id: c.awardId,
        contribution: c.contribution.toString(),
      })),
      audit_id: randomUUID(),
    },
  })
}
