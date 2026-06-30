import type { Context } from '../../context'

import { handleTwilioInbound, handleTwilioStatus } from './handler'

// Twilio posts form-urlencoded bodies. The dispatcher unwraps the raw body
// it stored on pending_webhooks back into params before invoking us.

function parseTwilioForm(payload: unknown, rawBody: string): Record<string, string> {
  // The dispatcher invokes us with JSON.parse(rawBody); for form-urlencoded
  // payloads that throws, so we fall back to URLSearchParams here.
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, string>
  }
  const params = new URLSearchParams(rawBody)
  const out: Record<string, string> = {}
  params.forEach((value, key) => {
    out[key] = value
  })
  return out
}

export function buildTwilioHandlers(
  ctx: Context,
): Record<string, (payload: unknown, ctx2: { rawBody: string }) => Promise<void>> {
  return {
    'twilio.inbound': (payload, ctx2) =>
      handleTwilioInbound(ctx, parseTwilioForm(payload, ctx2.rawBody)),
    'twilio.status.sent': (payload, ctx2) =>
      handleTwilioStatus(ctx, parseTwilioForm(payload, ctx2.rawBody)),
    'twilio.status.delivered': (payload, ctx2) =>
      handleTwilioStatus(ctx, parseTwilioForm(payload, ctx2.rawBody)),
    'twilio.status.failed': (payload, ctx2) =>
      handleTwilioStatus(ctx, parseTwilioForm(payload, ctx2.rawBody)),
    'twilio.status.undelivered': (payload, ctx2) =>
      handleTwilioStatus(ctx, parseTwilioForm(payload, ctx2.rawBody)),
  }
}
