import { and, eq } from 'drizzle-orm'

import { isCoinCurrency } from '@coinfrenzy/config'
import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { write as ledgerWrite, buildAdminAdjustment } from '../../../ledger/index'
import { publishEvent } from '../../../realtime/index'
import { toBigintAmount } from '../../../ledger/money'

interface AleaRoundPromoPayoutPayload {
  type: 'round.promoPayout'
  callbackType?: string
  eventId?: string
  adjustmentId?: string
  roundId: string
  casinoSessionId?: string
  playerId: string
  gameId?: string
  amount: number
  currency: string
  reason?: string
}

export async function handleAleaRoundPromoPayout(
  ctx: Context,
  payload: AleaRoundPromoPayoutPayload,
): Promise<void> {
  const { playerId, amount, currency, roundId } = payload

  if (!isCoinCurrency(currency)) {
    ctx.logger.error('alea_round_promo_payout_bad_currency', { roundId, currency })
    return
  }

  if (amount <= 0) {
    ctx.logger.info('alea_round_promo_payout_non_positive', { roundId, amount })
    return
  }

  const [session] = await ctx.db
    .select({
      id: schema.gameSessions.id,
      playerId: schema.gameSessions.playerId,
      currency: schema.gameSessions.currency,
    })
    .from(schema.gameSessions)
    .where(
      payload.casinoSessionId
        ? and(
            eq(schema.gameSessions.id, payload.casinoSessionId),
            eq(schema.gameSessions.playerId, playerId),
          )
        : eq(schema.gameSessions.playerId, playerId),
    )
    .limit(1)

  // Session is optional for promo payouts; proceed even if not found
  if (session && session.currency !== currency) {
    ctx.logger.error('alea_round_promo_payout_currency_mismatch', {
      roundId,
      playerId,
      requestCurrency: currency,
      sessionCurrency: session.currency,
    })
    return
  }

  const adjustmentId =
    payload.adjustmentId ?? payload.eventId ?? `${roundId}:${payload.reason ?? 'promo_payout'}`
  const spec = buildAdminAdjustment({
    adjustmentId: `alea:${adjustmentId}`,
    playerId,
    currency,
    amount: toBigintAmount(amount),
    subBucket: 'promo',
    direction: 'credit',
    metadata: {
      provider: 'alea',
      event_type: payload.callbackType ?? payload.type,
      reason: payload.reason ?? 'promo_payout',
      round_id: roundId,
      session_id: payload.casinoSessionId ?? null,
      external_game_id: payload.gameId ?? null,
    },
  })

  const result = await ledgerWrite(ctx, spec, {
    dedupLookbackDays: 3,
  })
  if (!result.ok) {
    ctx.logger.error('alea_round_promo_payout_ledger_failed', {
      roundId,
      playerId,
      error: result.error,
    })
    throw new Error(`ledger_write_failed:${result.error.code}`)
  }

  // Move audit and realtime updates to background to meet 5-second response SLA
  ctx.afterCommit(async () => {
    try {
      await writeAuditEntry(ctx.db, {
        actorKind: 'system',
        action: 'webhook.alea.round_promo_payout',
        resourceKind: 'game_round',
        reason: payload.reason ?? 'promo_payout',
        metadata: {
          round_id: roundId,
          player_id: playerId,
          amount,
          currency,
          callback_type: payload.callbackType ?? payload.type,
        },
      })

      await publishEvent(`private-player-${playerId}`, 'balance-update', { reason: 'promo_payout' })
    } catch (error) {
      ctx.logger.error('alea_round_promo_payout_background_operations_failed', {
        roundId,
        playerId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
