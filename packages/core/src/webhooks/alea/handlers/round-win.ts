import { and, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import { isCoinCurrency } from '@coinfrenzy/config'
import { TombstonedRoundError } from '../errors'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { awardBySlug, BONUS_SLUGS } from '../../../bonus/triggers'
import { recordPlayerEvent } from '../../../events/index'
import { write as ledgerWrite } from '../../../ledger/index'
import { invalidateBalanceCache } from '../../../ledger/balance'
import { buildWin } from '../../../ledger/transactions/win'
import { publishEvent } from '../../../realtime/index'
import { toBigintAmount } from '../../../ledger/money'

interface AleaRoundWinPayload {
  type: 'round.win'
  callbackType?: string
  txId?: string
  roundId: string
  playerId: string
  gameId: string
  amount: number
  currency: string
}

const BIG_WIN_THRESHOLD_MINOR = 100_000n * 10_000n // 100,000 SC equivalent

export async function handleAleaRoundWin(
  ctx: Context,
  payload: AleaRoundWinPayload,
): Promise<{ status: 'success' | 'already_processed' } | void> {
  const { roundId, amount, currency } = payload
  if (!isCoinCurrency(currency)) {
    ctx.logger.error('alea_round_win_bad_currency', { roundId, currency })
    return
  }

  const startRoundQuery = performance.now()
  const roundRows = await ctx.db
    .select({
      id: schema.gameRounds.id,
      playerId: schema.gameRounds.playerId,
      gameId: schema.gameRounds.gameId,
      createdAt: schema.gameRounds.createdAt,
      status: schema.gameRounds.status,
    })
    .from(schema.gameRounds)
    .where(
      and(
        eq(schema.gameRounds.externalRoundId, roundId),
        sql`created_at >= now() - interval '3 days'`,
      ),
    )
    .limit(1)
  ctx.logger.info('alea_timing_log', {
    step: 'win_round_query',
    elapsedMs: performance.now() - startRoundQuery,
  })

  const round = roundRows[0]
  if (!round) {
    // docs/04 §9.6 — win without a matching bet is SEV-1. We surface a loud
    // log + audit entry, then throw so Inngest retries (the bet might still
    // be in-flight from an out-of-order delivery).
    ctx.logger.error('alea_round_win_without_bet', { roundId })
    const startAuditWrite = performance.now()
    await writeAuditEntry(ctx.db, {
      actorKind: 'system',
      action: 'webhook.alea.win_without_bet',
      reason: 'win event arrived without preceding round.bet',
      metadata: { round_id: roundId, payload: payload as unknown as Record<string, unknown> },
    })
    ctx.logger.info('alea_timing_log', {
      step: 'win_audit_write_error',
      elapsedMs: performance.now() - startAuditWrite,
    })
    throw new Error(`alea_round_unknown:${roundId}`)
  }

  // Idempotency check: if round is already resolved, this is a duplicate win
  if (round.status === 'resolved') {
    ctx.logger.info('alea_round_win_duplicate', { roundId, txId: payload.txId })
    return { status: 'already_processed' }
  }

  const startRollbackCheck = performance.now()
  const rollbackByRoundRows = await ctx.db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.action, 'webhook.alea.round_rollback'),
        sql`metadata->>'round_id' = ${roundId}`,
      ),
    )
    .limit(1)

  // Collapse tx-level rollback checks into a single query when txId is present,
  // saving 2 extra DB round-trips on every win.
  const txRollbackRows = payload.txId
    ? await ctx.db
        .select({ id: schema.auditLog.id, action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(
          and(
            sql`action in ('webhook.alea.round_rollback', 'webhook.alea.pending_rollback')`,
            sql`metadata->>'original_tx_id' = ${payload.txId}`,
          ),
        )
        .limit(1)
    : []
  ctx.logger.info('alea_timing_log', {
    step: 'win_rollback_checks',
    elapsedMs: performance.now() - startRollbackCheck,
  })

  if (rollbackByRoundRows[0] || txRollbackRows[0]) {
    const reason =
      txRollbackRows[0]?.action === 'webhook.alea.pending_rollback'
        ? 'pending_rollback'
        : 'rollback_marker'
    const startUpdateStatusRefunded = performance.now()
    await ctx.db
      .update(schema.gameRounds)
      .set({ status: 'refunded' })
      .where(eq(schema.gameRounds.id, round.id))
    ctx.logger.info('alea_timing_log', {
      step: 'win_update_refunded_status',
      elapsedMs: performance.now() - startUpdateStatusRefunded,
    })
    ctx.logger.info('alea_round_win_skipped_rollback_marker', {
      roundId,
      txId: payload.txId,
      playerId: round.playerId,
      reason,
    })
    throw new TombstonedRoundError(`Round already rolled back (${reason}): ${roundId}`)
  }

  const startUpdateStatusResolved = performance.now()
  await ctx.db
    .update(schema.gameRounds)
    .set({
      winAmount: toBigintAmount(amount),
      status: 'resolved',
      wonAt: new Date(),
    })
    .where(eq(schema.gameRounds.id, round.id))
  ctx.logger.info('alea_timing_log', {
    step: 'win_update_resolved_status',
    elapsedMs: performance.now() - startUpdateStatusResolved,
  })

  if (amount > 0) {
    const spec = buildWin({
      roundId,
      playerId: round.playerId,
      currency,
      amount: toBigintAmount(amount),
      gameRoundId: round.id,
      metadata: {
        callback_type: payload.callbackType ?? payload.type,
        tx_id: payload.txId ?? null,
      },
    })
    const startLedgerWrite = performance.now()
    const result = await ledgerWrite(ctx, spec, {
      isolationLevel: 'read_committed',
      skipCacheInvalidation: true,
      flushLocalAfterCommit: false,
      dedupLookbackDays: 3,
    })
    ctx.logger.info('alea_timing_log', {
      step: 'win_ledger_write_call',
      elapsedMs: performance.now() - startLedgerWrite,
    })
    if (!result.ok) {
      ctx.logger.error('alea_round_win_ledger_failed', { roundId, error: result.error })
      throw new Error(`ledger_write_failed:${result.error.code}`)
    }

    if (result.value.status === 'duplicate') {
      return { status: 'already_processed' }
    }

    void invalidateBalanceCache(round.playerId, currency).catch((error) => {
      ctx.logger.error('alea_round_win_cache_invalidation_failed', {
        roundId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  // Move big win processing to background to meet 5-second response SLA
  if (toBigintAmount(amount) > BIG_WIN_THRESHOLD_MINOR) {
    ctx.afterCommit(async () => {
      try {
        await recordPlayerEvent(ctx.db, {
          playerId: round.playerId,
          eventName: 'player.game.big_win',
          eventCategory: 'game',
          payload: { round_id: roundId, amount },
          gameId: round.gameId,
          amount: toBigintAmount(amount),
          currency,
        })

        // docs/06 §13 — `jackpot` trigger fires on big wins. The award is
        // configured per-template; if no template is active this is a no-op.
        const jackpot = await awardBySlug(ctx, BONUS_SLUGS.jackpot, {
          playerId: round.playerId,
          sourceKind: 'round_win',
          sourceId: round.id,
          context: { winAmount: toBigintAmount(amount) },
          reason: `Big win on round ${roundId}`,
        })
        if (!jackpot.ok) {
          ctx.logger.info('jackpot_bonus_skipped', {
            roundId,
            playerId: round.playerId,
            code: jackpot.error.code,
          })
        }
      } catch (error) {
        ctx.logger.error('alea_round_win_background_bigwin_failed', {
          roundId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'webhook.alea.round_win',
    resourceKind: 'game_round',
    resourceId: round.id,
    metadata: {
      round_id: roundId,
      player_id: round.playerId,
      tx_id: payload.txId ?? null,
      amount,
      currency,
      callback_type: payload.callbackType ?? payload.type,
    },
  })

  await publishEvent(`private-player-${round.playerId}`, 'balance-update', { reason: 'win' })

  return { status: 'success' }
}
