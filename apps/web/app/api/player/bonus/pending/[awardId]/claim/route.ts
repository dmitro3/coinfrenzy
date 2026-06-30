import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import {
  bonus as bonusEngine,
  consoleLogger,
  createAfterCommitQueue,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'
import { formatCoins } from '@/lib/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/player/bonus/pending/[awardId]/claim — promote a pending
// bonus to active by writing the deferred ledger entry, bumping the
// wallet's playthrough_required rollup, and flipping the row's status.
// Idempotent: a second click after the first succeeds returns the same
// amounts via `duplicate`, so the popover can re-show the celebration
// deterministically.

interface ClaimResponse {
  claimed: boolean
  awardId: string
  gc: string
  sc: string
  bonusName: string
  message?: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ awardId: string }> },
) {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { awardId } = await params
  if (!awardId || typeof awardId !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
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

  const result = await bonusEngine.claimPending(ctx, {
    awardId,
    playerId: session.player.id,
  })
  await queue.flush()

  if (!result.ok) {
    if (result.error.code === 'AWARD_NOT_FOUND') {
      return NextResponse.json(
        { claimed: false, error: 'not_found', message: 'That bonus is no longer available.' },
        { status: 404 },
      )
    }
    if (result.error.code === 'WRONG_PLAYER') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (result.error.code === 'AWARD_NOT_PENDING') {
      return NextResponse.json(
        {
          claimed: false,
          error: 'not_pending',
          message: result.error.reason ?? 'Bonus is not pending.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        claimed: false,
        error: result.error.code,
        message: 'Could not claim the bonus right now.',
      },
      { status: 500 },
    )
  }

  const value = result.value
  const response: ClaimResponse = {
    claimed: value.status === 'claimed',
    awardId: value.awardId,
    gc: formatCoins(value.gcAmount).split('.')[0] ?? '0',
    sc: formatCoins(value.scAmount).split('.')[0] ?? '0',
    bonusName: value.bonusName,
    message: value.status === 'duplicate' ? 'Bonus already claimed.' : undefined,
  }
  return NextResponse.json(response)
}
