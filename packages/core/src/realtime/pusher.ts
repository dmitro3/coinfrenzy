import Pusher from 'pusher'

import { env } from '@coinfrenzy/config'

/**
 * Server-side Pusher publisher (docs/10 §7.3). The client subscribes via
 * `pusher-js`; the server publishes events from API routes and worker jobs.
 *
 * Returns `null` when Pusher credentials are not configured — the rest of
 * the app must handle this gracefully (per docs/10 §7.4, real-time is a
 * progressive enhancement, never a hard dependency).
 */
let cached: Pusher | null | undefined

export function getPusher(): Pusher | null {
  if (cached !== undefined) return cached
  const e = env()
  if (!e.PUSHER_APP_ID || !e.PUSHER_KEY || !e.PUSHER_SECRET || !e.PUSHER_CLUSTER) {
    cached = null
    return null
  }
  cached = new Pusher({
    appId: e.PUSHER_APP_ID,
    key: e.PUSHER_KEY,
    secret: e.PUSHER_SECRET,
    cluster: e.PUSHER_CLUSTER,
    useTLS: true,
  })
  return cached
}

/**
 * Safe publish — no-ops when Pusher is unconfigured. Logs errors instead
 * of throwing so a failing real-time channel never breaks the underlying
 * mutation.
 */
export async function publishEvent(
  channel: string,
  event: string,
  data: unknown,
  opts?: { socketId?: string },
): Promise<void> {
  const pusher = getPusher()
  if (!pusher) return
  try {
    await pusher.trigger(
      channel,
      event,
      data,
      opts?.socketId ? { socket_id: opts.socketId } : undefined,
    )
  } catch (error) {
    console.warn('[realtime] publishEvent failed', { channel, event, error })
  }
}

/**
 * Sign a Pusher private/presence channel subscription so the browser can
 * subscribe to it. Used by `/api/realtime/auth`.
 */
export function authorizeChannel(
  socketId: string,
  channel: string,
  presenceData?: { user_id: string; user_info?: Record<string, unknown> },
): { auth: string; channel_data?: string } | null {
  const pusher = getPusher()
  if (!pusher) return null
  if (channel.startsWith('presence-') && presenceData) {
    const result = pusher.authorizeChannel(socketId, channel, presenceData)
    return { auth: result.auth, channel_data: result.channel_data }
  }
  return pusher.authorizeChannel(socketId, channel)
}
