import 'server-only'

import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { adapters, ledger, webhooks } from '@coinfrenzy/core'
import { isCoinCurrency } from '@coinfrenzy/config'
import { schema } from '@coinfrenzy/db'
import { handleAleaRoundRefund } from '@coinfrenzy/core/webhooks/alea/handlers/round-refund'

import { buildWebhookContext } from '@/lib/webhook-context'

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
  operatorFreeSpin?: { amount?: number; currency?: string; gameId?: string }
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

  ctx.logger.info('Alea transaction received==========>>>>', { payload })

  if (txType === 'PROMO_PAYOUT') {
    const promoData = getPromoPayoutData(payload)
    if (!promoData) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

    const promoCurrency = promoData.currency ?? requestCurrency
    const parsedPlayerId = payload.playerId?.split('_')?.[0]
    const parsedCurrency = payload.playerId?.split('_')?.[1]
    if (!parsedPlayerId || !promoCurrency || !isCoinCurrency(promoCurrency)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    if (parsedCurrency && parsedCurrency !== promoCurrency) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    try {
      const handlers = webhooks.alea.buildAleaHandlers(ctx)
      const startPromoPayout = performance.now()
      await handlers['round.promoPayout'](
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

      const startPromoBalance = performance.now()
      const balance = await ledger.getBalance(ctx, parsedPlayerId, promoCurrency)
      ctx.logger.info('alea_timing_log', {
        step: 'ledger_get_balance_promo',
        elapsedMs: performance.now() - startPromoBalance,
      })
      if (!balance.ok) return internalErrorResponse()

      const balanceInMajorUnits = Number(balance.value.currentBalance) / 10000
      return NextResponse.json({
        id: payload.id ?? null,
        realBalance: balanceInMajorUnits,
        bonusBalance: 0.0,
        realAmount: promoData.amount,
        bonusAmount: 0.0,
      })
    } catch {
      return internalErrorResponse()
    }
  }

  const playerCompositeId = payload.player?.casinoPlayerId ?? payload.playerId
  const playerIdFromPayload = playerCompositeId?.split('_')?.[0]
  const currencyFromPayload = playerCompositeId?.split('_')?.[1]

  const rollbackPlayerId = playerIdFromPayload
  const rollbackCurrency = currencyFromPayload ?? requestCurrency

  if (
    !casinoSessionId ||
    !gameId ||
    (txType !== 'ROLLBACK' && roundId === undefined) ||
    !requestCurrency ||
    !isCoinCurrency(requestCurrency)
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
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

    switch (txType) {
      case 'BET': {
        ctx.logger.info('======About to call round.bet handler======')
        const startBet = performance.now()
        await handlers['round.bet'](mappedBet, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_bet',
          elapsedMs: performance.now() - startBet,
        })
        ctx.logger.info('======round.bet handler completed======')
        break
      }
      case 'WIN': {
        ctx.logger.info('======About to call round.win handler======')
        const startWin = performance.now()
        await handlers['round.win'](mappedWin, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_win',
          elapsedMs: performance.now() - startWin,
        })
        ctx.logger.info('======round.win handler completed======')
        break
      }
      case 'BET_WIN': {
        ctx.logger.info('======About to call round.bet handler for BET_WIN======')
        const startBetWinBet = performance.now()
        await handlers['round.bet'](mappedBet, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_bet_win_bet',
          elapsedMs: performance.now() - startBetWinBet,
        })
        ctx.logger.info('======round.bet handler for BET_WIN completed======')

        ctx.logger.info('======About to call round.win handler for BET_WIN======')
        const startBetWinWin = performance.now()
        await handlers['round.win'](mappedWin, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_bet_win_win',
          elapsedMs: performance.now() - startBetWinWin,
        })
        ctx.logger.info('======round.win handler for BET_WIN completed======')
        break
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
        break
      }
      case 'END_ROUND': {
        ctx.logger.info('======About to call round.end handler======')
        const startEndRound = performance.now()
        await handlers['round.end'](mappedEndRound, { rawBody })
        ctx.logger.info('alea_timing_log', {
          step: 'handler_round_end',
          elapsedMs: performance.now() - startEndRound,
        })
        ctx.logger.info('======round.end handler completed======')
        break
      }
      default:
        ctx.logger.error('Invalid transaction type', { txType, payload })
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    const startGetBalance = performance.now()
    const balance = await ledger.getBalance(ctx, effectivePlayerId, effectiveCurrency)
    ctx.logger.info('alea_timing_log', {
      step: 'ledger_get_balance',
      elapsedMs: performance.now() - startGetBalance,
    })
    if (!balance.ok) return internalErrorResponse()

    if (txType === 'BET_WIN') {
      const balanceInMajorUnits = Number(balance.value.currentBalance) / 10000
      return NextResponse.json({
        id: payload.id ?? null,
        realBalance: balanceInMajorUnits,
        bonusBalance: 0.0,
        bet: {
          realAmount: betAmount,
          bonusAmount: 0.0,
        },
        win: {
          realAmount: winAmount,
          bonusAmount: 0.0,
        },
      })
    }

    const balanceInMajorUnits = Number(balance.value.currentBalance) / 10000

    // Handle ROLLBACK response with idempotency flags
    if (txType === 'ROLLBACK' && refundResult) {
      if (refundResult.status === 'already_processed') {
        return NextResponse.json({
          id: payload.id ?? null,
          realBalance: balanceInMajorUnits,
          bonusBalance: 0.0,
          isAlreadyProcessed: true,
        })
      }

      if (refundResult.status === 'not_found') {
        return NextResponse.json({
          id: payload.id ?? null,
          realBalance: balanceInMajorUnits,
          bonusBalance: 0.0,
          isNotFound: true,
        })
      }
    }

    const responseAmount = txType === 'WIN' ? winAmount : betAmount

    ctx.logger.info('Alea transaction response=======>>>>>', {
      response: {
        id: payload.id ?? null,
        realBalance: balanceInMajorUnits,
        bonusBalance: 0.0,
        realAmount: responseAmount,
        bonusAmount: 0.0,
      },
    })

    return NextResponse.json({
      id: payload.id ?? null,
      realBalance: balanceInMajorUnits,
      bonusBalance: 0.0,
      realAmount: responseAmount,
      bonusAmount: 0.0,
    })
  } catch (error) {
    ctx.logger.error('Error processing Alea webhook', { error: JSON.stringify(error) })

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
