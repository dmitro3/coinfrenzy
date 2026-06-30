import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import {
  consoleLogger,
  createAfterCommitQueue,
  kyc,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'
import { sendInngestEvent } from '@/lib/inngest-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §6.3 — exchange the validation token from the Footprint SDK.
//
// The frontend invokes this from the `onComplete` callback of the
// Footprint widget. We update kyc_status + players.kyc_level synchronously,
// then progress any redemptions parked in `kyc_pending` (which may auto-
// approve and need a Finix submit fan-out).

const body = z.object({
  validationToken: z.string().min(1).max(512),
})

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const actor: Actor = { kind: 'player', playerId: session.player.id }
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await kyc.completeKycValidation(ctx, {
    playerId: session.player.id,
    validationToken: parsed.validationToken,
  })
  await queue.flush()

  if (!result.ok) {
    return NextResponse.json({ error: result.error.code }, { status: 400 })
  }

  // After auto-progression, any redemption that flipped to 'approved' needs
  // the worker to submit it. We don't know which one(s) inside core, so we
  // re-query by status for this player and dispatch one event per row.
  if (result.value.kycLevel >= 2) {
    const db = getDb()
    const approved = await db.query.redemptions.findMany({
      where: (r, { and, eq }) => and(eq(r.playerId, session.player.id), eq(r.status, 'approved')),
      columns: { id: true },
      limit: 25,
    })
    for (const row of approved) {
      await sendInngestEvent({
        name: 'redemption/submit-to-finix',
        data: { redemptionId: row.id },
      })
    }
  }

  return NextResponse.json({
    status: result.value.footprintStatus,
    level: result.value.kycLevel,
    terminal: result.value.terminal,
  })
}
