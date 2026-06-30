import 'server-only'

import { Inngest } from 'inngest'

// docs/05 §2.2 — the web app dispatches `webhook/<provider>.received`
// events; the worker app's Inngest functions consume them. The id strings
// MUST match between the apps so Inngest routes correctly.

export const inngest = new Inngest({ id: 'coinfrenzy-web' })

/**
 * Helper that mirrors the signature receiver expects. We swallow send
 * failures so a flaky Inngest connection never trumps a 200 OK to the
 * vendor — the poller catches missed events.
 */
export async function sendInngestEvent(event: {
  name: string
  data: Record<string, unknown>
}): Promise<void> {
  try {
    await inngest.send({ name: event.name, data: event.data })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[inngest] event send failed', {
      name: event.name,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
