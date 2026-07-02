import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { adapters, ledger, webhooks } from '@coinfrenzy/core'
import { env, isCoinCurrency } from '@coinfrenzy/config'
import { schema } from '@coinfrenzy/db'
import { handleAleaRoundRefund } from '@coinfrenzy/core/webhooks/alea/handlers/round-refund'

import { buildWebhookContext } from '@/lib/webhook-context'
import { updatePlayerDrift, getHPBalance, applyDriftToWallet } from '../drift'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AleaTxType = 'BET' | 'WIN' | 'BET_WIN' | 'ROLLBACK' | 'END_ROUND' | 'PROMO_PAYOUT'

interface AleaTransactionPayload {
  type?: AleaTxType
  id?: string | number
  transaction?: { id?: string | number }
  amount?: number
  bet?: { amount?: number }
  win?: { amount?: number }
  promoPayout?: { amount?: number }
  promoType?:
    | 'FREE_SPIN'
    | 'OPERATOR_FREE_SPIN'
    | 'PRIZE'
    | 'CASHBACK'
    | 'SPIN_GIFT'
    | 'TOURNAMENT'
    | 'ALEA_JACKPOT'
  freeSpin?: { amount?: number; currency?: string; gameId?: string }
  operatorFreeSpin?: { amount?: number; currency?: string; gameId?: string; bonusId?: string }
  prize?: { amount?: number; currency?: string; gameId?: string }
  cashback?: { amount?: number; currency?: string; gameId?: string }
  spinGift?: { amount?: number; currency?: string; gameId?: string }
  tournament?: { amount?: number; currency?: string; gameId?: string }
  aleaJackpot?: { amount?: number; currency?: string; gameId?: string }
  playerId?: string
  currency?: string
  casinoSessionId?: string
  game?: { id?: string }
  round?: { id?: string | number }
  player?: { casinoPlayerId?: string }
}

function getPromoPayoutData(payload: AleaTransactionPayload): {
  amount: number
  currency?: string
  gameId?: string
} | null {
  const pick = (obj?: { amount?: number; currency?: string; gameId?: string }) => {
    if (!obj) return null
    return {
      amount: Number(obj.amount ?? 0),
      currency: obj.currency,
      gameId: obj.gameId,
    }
  }

  switch (payload.promoType) {
    case 'FREE_SPIN':
      return pick(payload.freeSpin)
    case 'OPERATOR_FREE_SPIN':
      return pick(payload.operatorFreeSpin)
    case 'PRIZE':
      return pick(payload.prize)
    case 'CASHBACK':
      return pick(payload.cashback)
    case 'SPIN_GIFT':
      return pick(payload.spinGift)
    case 'TOURNAMENT':
      return pick(payload.tournament)
    case 'ALEA_JACKPOT':
      return pick(payload.aleaJackpot)
    default:
      return null
  }
}

function invalidSignatureResponse(): NextResponse {
  return NextResponse.json(
    {
      status: 'ERROR',
      code: 'INVALID_REQUEST',
      message: 'Signature Incorrect',
    },
    { status: 500 },
  )
}

function internalErrorResponse(): NextResponse {
  return NextResponse.json(
    {
      status: 'ERROR',
      code: 'GENERAL_ERROR',
      message: 'Please contact casino for this with the initial request.',
    },
    { status: 503 },
  )
}

export async function POST(req: NextRequest): Promise<Response> {
  const { ctx } = buildWebhookContext('alea')
  const startRawBody = performance.now()
  const rawBody = await req.text()
  ctx.logger.info('alea_timing_log', {
    step: 'route_raw_body_read',
    elapsedMs: performance.now() - startRawBody,
  })
  const signature = req.headers.get('digest') ?? undefined

  const verification = adapters.alea.verifyAleaDigestSignature({
    type: 'TRANSACTION',
    signature,
    rawBody,
  })

  if (!verification.ok) return invalidSignatureResponse()

  let payload: AleaTransactionPayload
  try {
    payload = JSON.parse(rawBody) as AleaTransactionPayload
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const txType = payload.type
  const casinoSessionId = payload.casinoSessionId
  const gameId = payload.game?.id
  const roundId = payload.round?.id
  const betAmount = Number(payload.bet?.amount ?? payload.amount ?? 0)
  const winAmount = Number(payload.win?.amount ?? payload.amount ?? 0)
  const requestCurrency = payload.currency

  if (!txType) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const playerCompositeId = payload.player?.casinoPlayerId ?? payload.playerId
  const playerIdFromPayload = playerCompositeId?.split('_')?.[0]
  const currencyFromPayload = playerCompositeId?.split('_')?.[1]

  if (playerIdFromPayload) {
    let isValidPlayerUuid = true
    try {
      if (
        typeof playerIdFromPayload !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerIdFromPayload)
      ) {
        isValidPlayerUuid = false
      }
    } catch {
      isValidPlayerUuid = false
    }

    if (!isValidPlayerUuid) {
      return NextResponse.json(
        {
          status: 'ERROR',
          code: 'INVALID_REQUEST',
          message: "Player couldn't be found in casino's system.",
        },
        { status: 500 },
      )
    }

    const playerRows = await ctx.db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(eq(schema.players.id, playerIdFromPayload))
      .limit(1)
    if (playerRows.length === 0) {
      return NextResponse.json(
        {
          status: 'ERROR',
          code: 'INVALID_REQUEST',
          message: "Player couldn't be found in casino's system.",
        },
        { status: 500 },
      )
    }
  }

  ctx.logger.info('Alea transaction received==========>>>>', { payload })

  if (txType === 'PROMO_PAYOUT') {
    const promoData = getPromoPayoutData(payload)
    if (!promoData) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

    const promoCurrency = promoData.currency ?? requestCurrency
    const parsedPlayerId = payload.playerId?.split('_')?.[0]
    const parsedCurrency = payload.playerId?.split('_')?.[1]
    if (!parsedPlayerId || !promoCurrency) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    if (!isCoinCurrency(promoCurrency)) {
      return NextResponse.json(
        {
          status: 'ERROR',
          code: 'INVALID_REQUEST',
          message: 'Request Made with invalid currency.',
        },
        { status: 500 },
      )
    }
    if (parsedCurrency && parsedCurrency !== promoCurrency) {
      return NextResponse.json(
        {
          status: 'ERROR',
          code: 'INVALID_REQUEST',
          message: 'Request Made with invalid currency.',
        },
        { status: 500 },
      )
    }

    if (payload.promoType === 'OPERATOR_FREE_SPIN') {
      const bonusId = payload.operatorFreeSpin?.bonusId
      let isValidUuid = true
      try {
        if (
          typeof bonusId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bonusId)
        ) {
          isValidUuid = false
        }
      } catch {
        isValidUuid = false
      }

      if (!isValidUuid) {
        return NextResponse.json(
          {
            status: 'ERROR',
            code: 'INVALID_REQUEST',
            message: 'Invalid bonus template ID',
          },
          { status: 500 },
        )
      }

      const bonusRows = await ctx.db
        .select({ id: schema.bonuses.id })
        .from(schema.bonuses)
        .where(eq(schema.bonuses.id, bonusId as string))
        .limit(1)
      if (bonusRows.length === 0) {
        if (env().NODE_ENV !== 'production' || process.env.ALEA_ENV === 'staging') {
          await ctx.db
            .insert(schema.bonuses)
            .values({
              id: bonusId as string,
              slug: `mock-bonus-${bonusId}`,
              displayName: `Mock Operator Free Spin Bonus`,
              bonusType: 'promotion',
              status: 'active',
            })
            .onConflictDoNothing()
        } else {
          return NextResponse.json(
            {
              status: 'ERROR',
              code: 'INVALID_REQUEST',
              message: 'Bonus template not found',
            },
            { status: 500 },
          )
        }
      }
    }

    try {
      const handlers = webhooks.alea.buildAleaHandlers(ctx)
      const startPromoPayout = performance.now()
      const res = await handlers['round.promoPayout'](
        {
          type: 'round.promoPayout' as const,
          callbackType: txType,
          adjustmentId: payload.id != null ? String(payload.id) : undefined,
          roundId: roundId != null ? String(roundId) : `promo:${String(payload.id ?? Date.now())}`,
          playerId: parsedPlayerId,
          gameId: promoData.gameId,
          amount: promoData.amount,
          currency: promoCurrency,
          reason: payload.promoType ?? 'promo_payout',
        },
        { rawBody },
      )
      ctx.logger.info('alea_timing_log', {
        step: 'handler_round_promo_payout',
        elapsedMs: performance.now() - startPromoPayout,
      })

      // Update drift!
      if (res && res.status !== 'already_processed') {
        const hpChange = promoData.amount
        const dbChange = Number(ledger.toBigintAmount(promoData.amount)) / 10000
        await updatePlayerDrift(parsedPlayerId, promoCurrency, hpChange - dbChange)
        await applyDriftToWallet(parsedPlayerId, promoCurrency, hpChange - dbChange)
      }

      const balance = await getHPBalance(parsedPlayerId, promoCurrency)
      const response: Record<string, any> = {
        id: payload.id ?? null,
        realBalance: balance,
        bonusBalance: 0.0,
        realAmount: promoData.amount,
        bonusAmount: 0.0,
      }
      if (res && res.status === 'already_processed') {
        response.isAlreadyProcessed = true
      }
      return NextResponse.json(response)
    } catch {
      return internalErrorResponse()
    }
  }

  const rollbackPlayerId = playerIdFromPayload
  const rollbackCurrency = currencyFromPayload ?? requestCurrency

  if (
    !casinoSessionId ||
    !gameId ||
    (txType !== 'ROLLBACK' && roundId === undefined) ||
    !requestCurrency
  ) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: 'Invalid request parameters',
      },
      { status: 400 },
    )
  }

  if (!isCoinCurrency(requestCurrency)) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: 'Request Made with invalid currency.',
      },
      { status: 500 },
    )
  }

  let session:
    | {
        playerId: string
        currency: string
        status: string
        gameExternalId: string | null
        gameId: string
        sessionId: string
      }
    | undefined

  if (casinoSessionId) {
    const startSessionQuery = performance.now()
    const rows = await ctx.db
      .select({
        playerId: schema.gameSessions.playerId,
        currency: schema.gameSessions.currency,
        status: schema.gameSessions.status,
        gameExternalId: schema.games.externalId,
        gameId: schema.games.id,
        sessionId: schema.gameSessions.id,
      })
      .from(schema.gameSessions)
      .innerJoin(schema.games, eq(schema.games.id, schema.gameSessions.gameId))
      .where(eq(schema.gameSessions.id, casinoSessionId))
      .limit(1)
    ctx.logger.info('alea_timing_log', {
      step: 'route_session_query',
      elapsedMs: performance.now() - startSessionQuery,
    })

    session = rows[0]
  }

  if (!session && txType !== 'ROLLBACK') {
    return NextResponse.json(
      {
        status: 'DENIED',
        code: 'SESSION_EXPIRED',
        message: 'Game Session Expired',
      },
      { status: 403 },
    )
  }

  if (txType !== 'ROLLBACK' && session && session.status !== 'active') {
    return NextResponse.json(
      {
        status: 'DENIED',
        code: 'SESSION_EXPIRED',
        message: 'Game Session Expired',
      },
      { status: 403 },
    )
  }

  if (txType !== 'ROLLBACK' && session && String(session.gameExternalId) !== String(gameId)) {
    return NextResponse.json(
      {
        status: 'DENIED',
        code: 'GAME_NOT_ALLOWED',
        message: 'This game could not be found in the casino.',
      },
      { status: 404 },
    )
  }

  if (
    txType !== 'ROLLBACK' &&
    session &&
    playerIdFromPayload &&
    playerIdFromPayload !== session.playerId
  ) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: "Player couldn't be found in casino's system.",
      },
      { status: 500 },
    )
  }

  if (
    txType !== 'ROLLBACK' &&
    session &&
    (requestCurrency !== session.currency ||
      (currencyFromPayload && currencyFromPayload !== session.currency))
  ) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: 'Request Made with invalid currency.',
      },
      { status: 500 },
    )
  }

  try {
    const handlers = webhooks.alea.buildAleaHandlers(ctx)

    let effectivePlayerId = session?.playerId ?? rollbackPlayerId
    let effectiveCurrency = session?.currency ?? rollbackCurrency

    if (txType === 'ROLLBACK' && (!effectivePlayerId || !effectiveCurrency) && roundId != null) {
      const startRoundQuery = performance.now()
      const roundRows = await ctx.db
        .select({
          playerId: schema.gameRounds.playerId,
          currency: schema.gameRounds.currency,
        })
        .from(schema.gameRounds)
        .where(eq(schema.gameRounds.externalRoundId, String(roundId)))
        .limit(1)
      ctx.logger.info('alea_timing_log', {
        step: 'route_rollback_round_query',
        elapsedMs: performance.now() - startRoundQuery,
      })

      const round = roundRows[0]
      if (round) {
        effectivePlayerId = effectivePlayerId ?? round.playerId
        effectiveCurrency = effectiveCurrency ?? round.currency
      }
    }

    if (!effectivePlayerId || !effectiveCurrency || !isCoinCurrency(effectiveCurrency)) {
      return internalErrorResponse()
    }

    const mappedBet = {
      type: 'round.bet' as const,
      callbackType: txType,
      txId: payload.id ? String(payload.id) : undefined,
      roundId: String(roundId),
      casinoSessionId,
      playerId: effectivePlayerId,
      gameId,
      amount: betAmount,
      currency: effectiveCurrency,
      resolvedSessionId: session?.sessionId,
      resolvedGameId: session?.gameId,
    }
    const mappedWin = {
      type: 'round.win' as const,
      callbackType: txType,
      txId: payload.id ? String(payload.id) : undefined,
      roundId: String(roundId),
      playerId: effectivePlayerId,
      gameId,
      amount: winAmount,
      currency: effectiveCurrency,
    }
    const mappedRefund = {
      type: 'round.refund' as const,
      callbackType: txType,
      rollbackTxId: payload.id ? String(payload.id) : undefined,
      originalTxId: payload.transaction?.id ? String(payload.transaction.id) : undefined,
      roundId: roundId != null ? String(roundId) : undefined,
      casinoSessionId,
      playerId: effectivePlayerId,
      gameId,
      amount: betAmount,
      currency: effectiveCurrency,
    }
    const mappedEndRound = {
      type: 'round.end' as const,
      callbackType: txType,
      roundId: String(roundId),
      casinoSessionId,
      playerId: effectivePlayerId,
      gameId,
    }

    let refundResult: { status: 'success' | 'already_processed' | 'not_found' } | undefined

    if (txType === 'BET' || txType === 'BET_WIN') {
      const hpBalance = await getHPBalance(effectivePlayerId, effectiveCurrency)
      if (hpBalance < betAmount) {
        return NextResponse.json(
          {
            status: 'DENIED',
            code: 'INSUFFICIENT_FUNDS',
            message: 'Insufficient funds',
          },
          { status: 400 },
        )
      }
    }

    switch (txType) {
      case 'BET': {
        ctx.logger.info('======About to call round.bet handler======')
        const startBet = performance.now()
        const res = await handlers['round.bet'](mappedBet, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_bet',
          elapsedMs: performance.now() - startBet,
        })
        ctx.logger.info('======round.bet handler completed======')

        if (res && res.status !== 'already_processed') {
          const hpChange = -betAmount
          const dbChange = -Number(ledger.toBigintAmount(betAmount)) / 10000
          await updatePlayerDrift(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
          await applyDriftToWallet(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
        }

        const balance = await getHPBalance(effectivePlayerId, effectiveCurrency)
        const response: Record<string, any> = {
          id: payload.id ?? null,
          realBalance: balance,
          bonusBalance: 0.0,
          realAmount: betAmount,
          bonusAmount: 0.0,
        }
        if (res && res.status === 'already_processed') {
          response.isAlreadyProcessed = true
        }
        return NextResponse.json(response)
      }
      case 'WIN': {
        ctx.logger.info('======About to call round.win handler======')
        const startWin = performance.now()
        const res = await handlers['round.win'](mappedWin, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_win',
          elapsedMs: performance.now() - startWin,
        })
        ctx.logger.info('======round.win handler completed======')

        if (res && res.status !== 'already_processed') {
          const hpChange = winAmount
          const dbChange = Number(ledger.toBigintAmount(winAmount)) / 10000
          await updatePlayerDrift(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
          await applyDriftToWallet(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
        }

        const balance = await getHPBalance(effectivePlayerId, effectiveCurrency)
        const response: Record<string, any> = {
          id: payload.id ?? null,
          realBalance: balance,
          bonusBalance: 0.0,
          realAmount: winAmount,
          bonusAmount: 0.0,
        }
        if (res && res.status === 'already_processed') {
          response.isAlreadyProcessed = true
        }
        return NextResponse.json(response)
      }
      case 'BET_WIN': {
        ctx.logger.info('======About to call round.bet handler for BET_WIN======')
        const startBetWinBet = performance.now()
        const resBet = await handlers['round.bet'](mappedBet, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_bet_win_bet',
          elapsedMs: performance.now() - startBetWinBet,
        })
        ctx.logger.info('======round.bet handler for BET_WIN completed======')

        ctx.logger.info('======About to call round.win handler for BET_WIN======')
        const startBetWinWin = performance.now()
        const resWin = await handlers['round.win'](mappedWin, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_bet_win_win',
          elapsedMs: performance.now() - startBetWinWin,
        })
        ctx.logger.info('======round.win handler for BET_WIN completed======')

        if (
          (!resBet || resBet.status !== 'already_processed') &&
          (!resWin || resWin.status !== 'already_processed')
        ) {
          const hpChange = winAmount - betAmount
          const dbChange =
            (Number(ledger.toBigintAmount(winAmount)) - Number(ledger.toBigintAmount(betAmount))) /
            10000
          await updatePlayerDrift(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
          await applyDriftToWallet(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
        }

        const balance = await getHPBalance(effectivePlayerId, effectiveCurrency)
        const response: Record<string, any> = {
          id: payload.id ?? null,
          realBalance: balance,
          bonusBalance: 0.0,
          bet: {
            realAmount: betAmount,
            bonusAmount: 0.0,
          },
          win: {
            realAmount: winAmount,
            bonusAmount: 0.0,
          },
        }
        if (
          resBet &&
          resBet.status === 'already_processed' &&
          resWin &&
          resWin.status === 'already_processed'
        ) {
          response.isAlreadyProcessed = true
        }
        return NextResponse.json(response)
      }
      case 'ROLLBACK': {
        ctx.logger.info('======About to call round.refund handler======')
        const startRefund = performance.now()
        refundResult = await handleAleaRoundRefund(ctx, mappedRefund)
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_refund',
          elapsedMs: performance.now() - startRefund,
        })
        ctx.logger.info('======round.refund handler completed======')

        let originalHpAmount = 0
        let originalDbAmount = 0
        let originalType: 'bet' | 'win' = 'bet'
        if (payload.transaction?.id) {
          const txLogs = await ctx.db
            .select({
              action: schema.auditLog.action,
              metadata: schema.auditLog.metadata,
            })
            .from(schema.auditLog)
            .where(
              and(
                inArray(schema.auditLog.action, [
                  'webhook.alea.round_bet',
                  'webhook.alea.round_win',
                ]),
                sql`metadata->>'tx_id' = ${String(payload.transaction.id)}`,
              ),
            )
            .limit(1)
          const log = txLogs[0]
          if (log && typeof log.metadata === 'object' && log.metadata !== null) {
            const meta = log.metadata as Record<string, unknown>
            originalHpAmount = Number(meta.amount ?? 0)
            originalType = log.action === 'webhook.alea.round_win' ? 'win' : 'bet'
            originalDbAmount = Number(ledger.toBigintAmount(originalHpAmount)) / 10000
          }
        }

        if (
          refundResult &&
          refundResult.status !== 'already_processed' &&
          refundResult.status !== 'not_found'
        ) {
          const hpChange = originalType === 'win' ? -originalHpAmount : originalHpAmount
          const dbChange = originalType === 'win' ? -originalDbAmount : originalDbAmount
          await updatePlayerDrift(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
          await applyDriftToWallet(effectivePlayerId, effectiveCurrency, hpChange - dbChange)
        }

        const balance = await getHPBalance(effectivePlayerId, effectiveCurrency)

        if (refundResult) {
          if (refundResult.status === 'already_processed') {
            return NextResponse.json({
              id: payload.id ?? null,
              realBalance: balance,
              bonusBalance: 0.0,
              isAlreadyProcessed: true,
            })
          }
          if (refundResult.status === 'not_found') {
            return NextResponse.json({
              id: payload.id ?? null,
              realBalance: balance,
              bonusBalance: 0.0,
              isNotFound: true,
            })
          }
        }

        return NextResponse.json({
          id: payload.id ?? null,
          realBalance: balance,
          bonusBalance: 0.0,
        })
      }
      case 'END_ROUND': {
        ctx.logger.info('======About to call round.end handler======')
        const startEndRound = performance.now()
        const res = await handlers['round.end'](mappedEndRound, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_end',
          elapsedMs: performance.now() - startEndRound,
        })
        ctx.logger.info('======round.end handler completed======')

        const balance = await getHPBalance(effectivePlayerId, effectiveCurrency)
        const response: Record<string, any> = {
          id: payload.id ?? null,
          realBalance: balance,
          bonusBalance: 0.0,
          realAmount: betAmount,
          bonusAmount: 0.0,
        }
        if (res && res.status === 'already_processed') {
          response.isAlreadyProcessed = true
        }
        return NextResponse.json(response)
      }
      default:
        ctx.logger.error('Invalid transaction type', { txType, payload })
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
  } catch (error) {
    ctx.logger.error('Error processing Alea webhook', { error: String(error) })

    if (error instanceof Error && error.name === 'TombstonedRoundError') {
      return NextResponse.json(
        {
          status: 'ERROR',
          code: 'INVALID_REQUEST',
          message: 'Round already rolled back',
        },
        { status: 400 },
      )
    }

    if (error instanceof Error && error.name === 'InsufficientBalanceError') {
      return NextResponse.json(
        {
          status: 'DENIED',
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient funds',
        },
        { status: 400 },
      )
    }

    // Handle specific retryable errors
    if (error instanceof Error && error.name === 'SessionNotFoundError') {
      return NextResponse.json(
        {
          status: 'ERROR',
          code: 'SESSION_NOT_FOUND',
          message: 'Game session not found, please retry',
        },
        { status: 503 },
      )
    }

    return internalErrorResponse()
  }
}
