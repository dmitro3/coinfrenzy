import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'

import { withActor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ items: [] })
  }

  const rows = await withActor(session.player.id, 'player', null, (tx) =>
    tx
      .select({
        id: schema.notifications.id,
        title: schema.notifications.title,
        body: schema.notifications.body,
        ctaUrl: schema.notifications.ctaUrl,
        category: schema.notifications.category,
        priority: schema.notifications.priority,
        readAt: schema.notifications.readAt,
        createdAt: schema.notifications.createdAt,
      })
      .from(schema.notifications)
      .where(eq(schema.notifications.playerId, session.player.id))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(20),
  )

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    })),
  })
}
