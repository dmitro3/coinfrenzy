import type { Context } from '../../context'

import { handleAleaRoundBet } from './handlers/round-bet'
import { handleAleaRoundRefund } from './handlers/round-refund'
import { handleAleaRoundPromoPayout } from './handlers/round-promo-payout'
import { handleAleaRoundEnd } from './handlers/round-end'
import { handleAleaRoundWin } from './handlers/round-win'

type HandlerFn = (payload: unknown, ctx2: { rawBody: string }) => Promise<void>

export function buildAleaHandlers(ctx: Context): Record<string, HandlerFn> {
  ctx.logger.info('======Alea handlers built======')
  return {
    'round.bet': (payload) => {
      return handleAleaRoundBet(ctx, payload as Parameters<typeof handleAleaRoundBet>[1])
    },
    'round.win': (payload) => {
      return handleAleaRoundWin(ctx, payload as Parameters<typeof handleAleaRoundWin>[1])
    },
    // 'session.opened': (payload) =>
    //   handleAleaSessionEvent(ctx, payload as Parameters<typeof handleAleaSessionEvent>[1]),
    // 'session.closed': (payload) =>
    //   handleAleaSessionEvent(ctx, payload as Parameters<typeof handleAleaSessionEvent>[1]),
    'round.refund': (payload) =>
      handleAleaRoundRefund(ctx, payload as Parameters<typeof handleAleaRoundRefund>[1]).then(
        () => {},
      ),
    'round.promoPayout': (payload) =>
      handleAleaRoundPromoPayout(ctx, payload as Parameters<typeof handleAleaRoundPromoPayout>[1]),
    'round.end': (payload) =>
      handleAleaRoundEnd(ctx, payload as Parameters<typeof handleAleaRoundEnd>[1]),
  }
}
