import { and, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'

interface AleaRoundEndPayload {
  type: 'round.end'
  callbackType?: string
  roundId: string
  casinoSessionId?: string
  playerId: string
  gameId?: string
}

export async function handleAleaRoundEnd(
  ctx: Context,
  payload: AleaRoundEndPayload,
): Promise<{ status: 'success' | 'already_processed' } | void> {
  const rows = await ctx.db
    .select({
      id: schema.gameRounds.id,
      status: schema.gameRounds.status,
      playerId: schema.gameRounds.playerId,
    })
    .from(schema.gameRounds)
    .where(
      and(
        eq(schema.gameRounds.externalRoundId, payload.roundId),
        sql`created_at >= now() - interval '3 days'`,
      ),
    )
    .limit(1)

  const round = rows[0]
  if (!round) {
    ctx.logger.info('alea_end_round_unknown_round', {
      roundId: payload.roundId,
      playerId: payload.playerId,
      sessionId: payload.casinoSessionId ?? null,
    })
    return
  }

  if (round.status === 'resolved' || round.status === 'refunded') {
    ctx.logger.info('alea_end_round_already_processed', { roundId: payload.roundId })
    return { status: 'already_processed' }
  }

  if (round.status === 'bet_placed') {
    await ctx.db
      .update(schema.gameRounds)
      .set({ status: 'resolved', wonAt: new Date() })
      .where(eq(schema.gameRounds.id, round.id))
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'webhook.alea.end_round',
    resourceKind: 'game_round',
    resourceId: round.id,
    metadata: {
      round_id: payload.roundId,
      player_id: round.playerId,
      session_id: payload.casinoSessionId ?? null,
      external_game_id: payload.gameId ?? null,
      callback_type: payload.callbackType ?? payload.type,
    },
  })

  return { status: 'success' }
}
