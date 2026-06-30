import type { Context } from '../../context'

import { handleSendGridEventBatch } from './handler'

type HandlerFn = (payload: unknown, ctx2: { rawBody: string }) => Promise<void>

export function buildSendGridHandlers(ctx: Context): Record<string, HandlerFn> {
  return {
    'sendgrid.event_batch': (payload) =>
      handleSendGridEventBatch(ctx, payload as Parameters<typeof handleSendGridEventBatch>[1]),
  }
}
