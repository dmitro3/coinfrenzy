import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import {
  consoleLogger,
  createAfterCommitQueue,
  vip as vipModule,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { canAssignBonusAsHost, isHost } from '@coinfrenzy/core/auth'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'
import { getDb } from '@coinfrenzy/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// M4 — host bonus award. Validates:
//   1. caller is a host (or master allowed as fallback per canAssignBonusAsHost)
//   2. player is assigned to this host
//   3. bonus template is host_available=true and active
//   4. weekly cap not exceeded ($500 SC per player rolling 7d)
// All failure modes return a structured error payload the UI surfaces.

const body = z.object({
  playerId: z.string().uuid(),
  bonusId: z.string().uuid(),
  note: z.string().max(2000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canAssignBonusAsHost(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  // For non-hosts (master fallback) we don't enforce ownership/cap; only hosts
  // go through the gated flow. Keep it explicit so non-hosts get a 400 here
  // and use /admin/bonus/manual-award instead.
  if (!isHost(session.payload.role)) {
    return NextResponse.json(
      { error: 'wrong_endpoint', reason: 'Use /api/admin/bonus/manual-award for master grants.' },
      { status: 400 },
    )
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

  const meta = await getRequestMeta()
  const actor: Actor = {
    kind: 'admin',
    adminId: session.admin.id,
    role: session.payload.role,
    ip: meta.ip,
  }
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await vipModule.awardHostBonus(ctx, {
    hostId: session.admin.id,
    playerId: parsed.playerId,
    bonusId: parsed.bonusId,
    note: parsed.note ?? null,
  })
  await queue.flush()

  if (!result.ok) {
    const status =
      result.error.code === 'PLAYER_NOT_ASSIGNED'
        ? 403
        : result.error.code === 'WEEKLY_CAP_EXCEEDED'
          ? 429
          : 400
    return NextResponse.json(
      {
        error: result.error.code,
        reason: result.error.reason,
        budget: result.error.budget
          ? {
              capSc: result.error.budget.capSc.toString(),
              usedSc: result.error.budget.usedSc.toString(),
              remainingSc: result.error.budget.remainingSc.toString(),
            }
          : undefined,
      },
      { status },
    )
  }

  return NextResponse.json({
    awardId: result.value.awardId,
    budget: {
      capSc: result.value.budget.capSc.toString(),
      usedSc: result.value.budget.usedSc.toString(),
      remainingSc: result.value.budget.remainingSc.toString(),
    },
  })
}
