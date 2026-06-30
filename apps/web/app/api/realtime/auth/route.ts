import { NextResponse, type NextRequest } from 'next/server'

import { authorizeChannel } from '@coinfrenzy/core/realtime'

import { getAdminSession } from '@/lib/admin-session'
import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/realtime/auth
 *
 * Per docs/10 §7.2 — signs a Pusher private/presence channel subscription
 * after verifying the caller's session. Admin channels begin with
 * `private-admin-` or are the shared `admin-*` ones; player channels begin
 * with `private-player-`.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const socketId = form?.get('socket_id')?.toString()
  const channel = form?.get('channel_name')?.toString()
  if (!socketId || !channel) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Player channels: private-player-<player_id>
  if (channel.startsWith('private-player-')) {
    const session = await getPlayerSession()
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const pid = channel.slice('private-player-'.length)
    if (pid !== session.player.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const result = authorizeChannel(socketId, channel)
    if (!result) {
      return NextResponse.json({ error: 'realtime_unconfigured' }, { status: 503 })
    }
    return NextResponse.json(result)
  }

  // Admin channels: private-admin-<admin_id> or admin-*
  const adminSession = await getAdminSession()
  if (!adminSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (channel.startsWith('private-admin-')) {
    const aid = channel.slice('private-admin-'.length)
    if (aid !== adminSession.admin.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  } else if (!channel.startsWith('admin-')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const result = authorizeChannel(socketId, channel)
  if (!result) {
    return NextResponse.json({ error: 'realtime_unconfigured' }, { status: 503 })
  }
  return NextResponse.json(result)
}
