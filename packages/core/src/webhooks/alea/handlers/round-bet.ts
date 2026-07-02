import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import { isCoinCurrency } from '@coinfrenzy/config'
import { TombstonedRoundError } from '../errors'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { recordBet as bonusRecordBet, recordContributionAudit } from '../../../bonus/playthrough'
import { write as ledgerWrite } from '../../../ledger/index'
import { invalidateBalanceCache } from '../../../ledger/balance'
import { buildBet } from '../../../ledger/transactions/bet'
import { toBigintAmount } from '../../../ledger/money'

// docs/05 §5.5 — round.bet handler. Three writes per round:
//   1. game_rounds insert
//   2. ledger.write(buildBet) — debits player_wallet, credits house_winnings
//   3. bonus.recordBet — progresses playthrough for every active bonus

interface AleaRoundBetPayload {
  type: 'round.bet'
  callbackType?: string
  txId?: string
  roundId: string
  casinoSessionId: string
  playerId: string
  gameId: string
  amount: number
  currency: string
  timestamp?: string
  resolvedSessionId?: string
  resolvedGameId?: string
}

export async function handleAleaRoundBet(
  ctx: Context,
  payload: AleaRoundBetPayload,
): Promise<{ status: 'success' | 'already_processed' } | void> {
  const startTime = Date.now()
  const { roundId, casinoSessionId, playerId, gameId, amount, currency } = payload
  ctx.logger.info('alea_round_bet_start', { roundId, txId: payload.txId })
  if (!isCoinCurrency(currency)) {
    ctx.logger.error('alea_round_bet_bad_currency', { roundId, currency })
    return
  }

  // Idempotency at the round level. The pending_webhooks unique-on-event-id
  // guard already protected us from receiver-side duplicates; this catches
  // the case where Alea sends `round.bet` twice with different envelope ids.
  const startExisting = performance.now()
  const existing = await ctx.db
    .select({
      id: schema.gameRounds.id,
      createdAt: schema.gameRounds.createdAt,
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
    step: 'bet_existing_check',
    elapsedMs: performance.now() - startExisting,
  })
  if (payload.txId) {
    const existingTx = await ctx.db
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, 'webhook.alea.round_bet'),
          sql`metadata->>'tx_id' = ${payload.txId}`,
        ),
      )
      .limit(1)
    if (existingTx[0]) {
      ctx.logger.info('alea_round_bet_duplicate', { roundId, txId: payload.txId })
      return { status: 'already_processed' }
    }
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
  // saving 2 extra DB round-trips on every bet.
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
    step: 'bet_rollback_checks',
    elapsedMs: performance.now() - startRollbackCheck,
  })

  if (rollbackByRoundRows[0] || txRollbackRows[0]) {
    const reason =
      txRollbackRows[0]?.action === 'webhook.alea.pending_rollback'
        ? 'pending_rollback'
        : 'rollback_marker'
    ctx.logger.info('alea_round_bet_skipped_rollback_marker', {
      roundId,
      txId: payload.txId,
      reason,
    })
    throw new TombstonedRoundError(`Round already rolled back (${reason}): ${roundId}`)
  }

  let resolvedSessionId = payload.resolvedSessionId
  let resolvedGameId = payload.resolvedGameId
  let wallet: typeof schema.wallets.$inferSelect | undefined

  if (resolvedSessionId && resolvedGameId) {
    const startWalletResolve = performance.now()
    const walletRows = await ctx.db
      .select({
        id: schema.wallets.id,
        playerId: schema.wallets.playerId,
        currency: schema.wallets.currency,
        currentBalance: schema.wallets.currentBalance,
        balancePurchased: schema.wallets.balancePurchased,
        balanceBonus: schema.wallets.balanceBonus,
        balancePromo: schema.wallets.balancePromo,
        balanceEarned: schema.wallets.balanceEarned,
        playthroughRequired: schema.wallets.playthroughRequired,
        playthroughProgress: schema.wallets.playthroughProgress,
        createdAt: schema.wallets.createdAt,
        updatedAt: schema.wallets.updatedAt,
      })
      .from(schema.wallets)
      .where(and(eq(schema.wallets.playerId, playerId), eq(schema.wallets.currency, currency)))
      .limit(1)
    ctx.logger.info('alea_timing_log', {
      step: 'bet_wallet_resolve_preresolved',
      elapsedMs: performance.now() - startWalletResolve,
    })
    wallet = walletRows[0]
  } else {
    // Fallback: run queries in parallel to reduce database round-trips
    const startParallelResolve = performance.now()
    const [sessionRows, gameRows, walletRows] = await Promise.all([
      ctx.db
        .select({ id: schema.gameSessions.id, playerId: schema.gameSessions.playerId })
        .from(schema.gameSessions)
        .where(eq(schema.gameSessions.id, casinoSessionId))
        .limit(1),
      ctx.db
        .select({ id: schema.games.id })
        .from(schema.games)
        .where(eq(schema.games.externalId, gameId))
        .limit(1),
      ctx.db
        .select({
          id: schema.wallets.id,
          playerId: schema.wallets.playerId,
          currency: schema.wallets.currency,
          currentBalance: schema.wallets.currentBalance,
          balancePurchased: schema.wallets.balancePurchased,
          balanceBonus: schema.wallets.balanceBonus,
          balancePromo: schema.wallets.balancePromo,
          balanceEarned: schema.wallets.balanceEarned,
          playthroughRequired: schema.wallets.playthroughRequired,
          playthroughProgress: schema.wallets.playthroughProgress,
          createdAt: schema.wallets.createdAt,
          updatedAt: schema.wallets.updatedAt,
        })
        .from(schema.wallets)
        .where(and(eq(schema.wallets.playerId, playerId), eq(schema.wallets.currency, currency)))
        .limit(1),
    ])
    ctx.logger.info('alea_timing_log', {
      step: 'bet_parallel_resolve_fallback',
      elapsedMs: performance.now() - startParallelResolve,
    })

    const session = sessionRows[0]
    if (!session) {
      // Out-of-order delivery — throw specific error for retry handling
      const error = new Error(`Session not found: ${casinoSessionId}`)
      error.name = 'SessionNotFoundError'
      throw error
    }
    if (session.playerId !== playerId) {
      ctx.logger.error('alea_round_player_mismatch', {
        sessionPlayer: session.playerId,
        roundPlayer: playerId,
        roundId,
      })
      return
    }

    const game = gameRows[0]
    if (!game) {
      ctx.logger.error('alea_round_unknown_game', { gameExternalId: gameId, roundId })
      return
    }

    resolvedSessionId = session.id
    resolvedGameId = game.id
    wallet = walletRows[0]
  }

  if (!wallet) {
    ctx.logger.error('alea_round_bet_wallet_missing', { playerId, currency })
    return
  }

  const existingRound = existing[0]
  const roundDbId = existingRound ? existingRound.id : randomUUID()
  const startRoundInsert = performance.now()
  if (existingRound) {
    await ctx.db
      .update(schema.gameRounds)
      .set({
        betAmount: sql`${schema.gameRounds.betAmount} + ${toBigintAmount(amount)}`,
        status: 'bet_placed',
      })
      .where(eq(schema.gameRounds.id, roundDbId))
  } else {
    await ctx.db.insert(schema.gameRounds).values({
      id: roundDbId,
      sessionId: resolvedSessionId,
      playerId,
      gameId: resolvedGameId,
      externalRoundId: roundId,
      betAmount: toBigintAmount(amount),
      winAmount: 0n,
      currency,
      status: 'bet_placed',
      betAt: new Date(),
    })
  }
  ctx.logger.info('alea_timing_log', {
    step: 'bet_round_insert',
    elapsedMs: performance.now() - startRoundInsert,
  })

  const built = buildBet({
    roundId,
    playerId,
    currency,
    amount: toBigintAmount(amount),
    buckets: {
      purchased: wallet.balancePurchased,
      earned: wallet.balanceEarned,
      promo: wallet.balancePromo,
      bonus: wallet.balanceBonus,
    },
    gameRoundId: roundDbId,
    metadata: {
      game_external_id: gameId,
      session_id: resolvedSessionId,
      callback_type: payload.callbackType ?? payload.type,
      tx_id: payload.txId ?? null,
    },
  })

  const ledgerStartTime = Date.now()
  ctx.logger.info('alea_round_bet_ledger_start', { roundId, elapsed: ledgerStartTime - startTime })

  // Create a context without afterCommit for faster ledger writes
  const fastCtx = {
    ...ctx,
    afterCommit: () => {}, // No-op to skip Redis invalidation during critical path
  }

  const startLedgerWrite = performance.now()
  const result = await ledgerWrite(fastCtx, built.spec, {
    isolationLevel: 'read_committed',
    skipCacheInvalidation: true,
    flushLocalAfterCommit: false,
    dedupLookbackDays: 3,
  })
  ctx.logger.info('alea_timing_log', {
    step: 'bet_ledger_write_call',
    elapsedMs: performance.now() - startLedgerWrite,
  })
  const ledgerEndTime = Date.now()
  ctx.logger.info('alea_round_bet_ledger_complete', {
    roundId,
    elapsed: ledgerEndTime - startTime,
    ledgerTime: ledgerEndTime - ledgerStartTime,
  })

  if (!result.ok) {
    ctx.logger.error('alea_round_bet_ledger_failed', { roundId, error: result.error })
    throw new Error(`ledger_write_failed:${result.error.code}`)
  }

  if (result.value.status === 'duplicate') {
    return { status: 'already_processed' }
  }

  void invalidateBalanceCache(playerId, currency).catch((error) => {
    ctx.logger.error('alea_round_bet_cache_invalidation_failed', {
      roundId,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  // Fire-and-forget post-processing so webhook response is not blocked.
  void (async () => {
    try {
      await writeAuditEntry(ctx.db, {
        actorKind: 'system',
        action: 'webhook.alea.round_bet',
        resourceKind: 'game_round',
        resourceId: roundDbId,
        metadata: {
          round_id: roundId,
          session_id: resolvedSessionId,
          tx_id: payload.txId ?? null,
          amount,
          currency,
          callback_type: payload.callbackType ?? payload.type,
        },
      })

      const playthrough = await bonusRecordBet(ctx, {
        playerId,
        currency,
        amount: toBigintAmount(amount),
        gameId: resolvedGameId,
        roundId: roundDbId,
        externalRoundId: roundId,
      })

      if (playthrough.contributed.length > 0) {
        await recordContributionAudit(ctx, {
          roundId: roundDbId,
          playerId,
          contributions: playthrough.contributed.map((c) => ({
            awardId: c.awardId,
            contribution: c.contribution,
          })),
        })
      }
    } catch (error) {
      ctx.logger.error('alea_round_bet_background_operations_failed', {
        roundId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()

  const endTime = Date.now()
  ctx.logger.info('alea_round_bet_complete', {
    roundId,
    totalElapsed: endTime - startTime,
    ledgerTime: ledgerEndTime - ledgerStartTime,
  })

  return { status: 'success' }
}
