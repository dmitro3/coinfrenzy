import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'

interface AleaSessionEventPayload {
  type: 'session.opened' | 'session.closed'
  casinoSessionId: string
  timestamp?: string
}

export async function handleAleaSessionEvent(
  ctx: Context,
  payload: AleaSessionEventPayload,
): Promise<void> {
  const rows = await ctx.db
    .select({ id: schema.gameSessions.id })
    .from(schema.gameSessions)
    .where(eq(schema.gameSessions.id, payload.casinoSessionId))
    .limit(1)
  const session = rows[0]
  if (!session) {
    ctx.logger.info('alea_session_event_unknown', {
      type: payload.type,
      sessionId: payload.casinoSessionId,
    })
    return
  }

  if (payload.type === 'session.closed') {
    await ctx.db
      .update(schema.gameSessions)
      .set({ status: 'closed', endedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.gameSessions.id, session.id))
  }
}
