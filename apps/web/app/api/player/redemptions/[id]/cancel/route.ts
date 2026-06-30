import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import {
  consoleLogger,
  createAfterCommitQueue,
  redemption as redemptionMod,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §2 — players can cancel their own redemptions while still
// pre-payment (requested / pending_review / kyc_pending). Anything beyond
// `approved` is locked — at that point the cashier or the worker has
// committed to a payout.

export async function POST(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx2.params
  const db = getDb()

  const redemption = await db.query.redemptions.findFirst({
    where: (r, { eq }) => eq(r.id, id),
  })
  if (!redemption) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (redemption.playerId !== session.player.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!isCancellableByPlayer(redemption.status)) {
    return NextResponse.json(
      { error: 'invalid_state', current: redemption.status },
      { status: 400 },
    )
  }

  const actor: Actor = { kind: 'player', playerId: session.player.id }
  const queue = createAfterCommitQueue(consoleLogger)
  const coreCtx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  // Cancellation reuses the reject path so the SC-return ledger entries
  // fire identically. The audit row records the player as the actor.
  const result = await redemptionMod.rejectRedemption(coreCtx, {
    redemptionId: id,
    reason: 'Cancelled by player',
    reasonCategory: 'player_cancelled',
  })
  await queue.flush()

  if (!result.ok) {
    return NextResponse.json({ error: result.error.code }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

function isCancellableByPlayer(status: string): boolean {
  // AML hold is sticky — it must clear via manager review before the SC
  // returns to the player; we don't let a self-cancel route around that.
  return status === 'requested' || status === 'pending_review' || status === 'kyc_pending'
}
