import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { consoleLogger, vip as vipModule } from '@coinfrenzy/core'
import { canManageVipAssignments } from '@coinfrenzy/core/auth'

import { getAdminSession } from '@/lib/admin-session'
import { getDb } from '@coinfrenzy/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// M4 — master/manager assigns one or more players to a host. Optional
// reason is captured in the audit log. Unassignment is supported by
// passing `hostId: null`.

const body = z.object({
  playerIds: z.array(z.string().uuid()).min(1).max(500),
  hostId: z.string().uuid().nullable(),
  reason: z.string().max(2000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageVipAssignments(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()
  let assigned = 0
  const failed: string[] = []
  for (const playerId of parsed.playerIds) {
    try {
      if (parsed.hostId == null) {
        await vipModule.unassignFromHost(
          db,
          playerId,
          session.admin.id,
          session.payload.role,
          parsed.reason ?? undefined,
        )
      } else {
        await vipModule.assignToHost(
          db,
          playerId,
          parsed.hostId,
          session.admin.id,
          session.payload.role,
          parsed.reason ?? undefined,
        )
      }
      assigned++
    } catch (e) {
      failed.push(playerId)
      consoleLogger.warn('assign failed', {
        playerId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ ok: true, assigned, failed })
}
