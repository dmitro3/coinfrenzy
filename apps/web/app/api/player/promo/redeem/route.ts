import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { consoleLogger, createAfterCommitQueue, type Actor, type Context } from '@coinfrenzy/core'
import { bonus as bonusEngine } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'
import { formatCoins } from '@/lib/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/06 §12 — standalone promo-code redemption (the "I have a code"
// box on the cashier page and account). Purchase-flow promo codes are
// recorded on the purchase row and fired by the Finix handler.

const body = z.object({
  code: z.string().trim().min(1).max(64),
  /** Default 'standalone'; cashier page passes 'purchase' before checkout. */
  context: z.enum(['signup', 'purchase', 'standalone']).default('standalone'),
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

  const result = await bonusEngine.redeemPromoCode(ctx, {
    playerId: session.player.id,
    code: parsed.code,
    context: parsed.context,
  })
  await queue.flush()

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error.code,
        expected: 'expected' in result.error ? result.error.expected : undefined,
      },
      { status: 400 },
    )
  }

  return NextResponse.json({
    awardId: result.value.awardId,
    awardStatus: result.value.awardStatus,
    bonusId: result.value.bonusId,
    // Friendly major-unit strings consumed by the Rewards popover so the
    // celebration view can show "+10,000 GC + 1 SC". Zero when the
    // award was deduped (status === 'duplicate').
    gc: formatCoins(result.value.gcAmount).split('.')[0],
    sc: formatCoins(result.value.scAmount).split('.')[0],
  })
}
