import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

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

// Player-initiated daily bonus claim. Gated by the engine's rolling
// 24h cooldown (see docs/06 §4 "Cooldown check"): repeated calls within
// the cooldown window return COOLDOWN_ACTIVE with `retryAfterHours`,
// which we surface as a friendly message. The award itself goes through
// the same engine path as any other bonus — playthrough-tracked,
// audit-logged, Pusher-pushed.
//
// `sourceId` is per-claim (unique UUID) because the cooldown now does
// the gating, not the (player, UTC day) idempotency anchor we used to
// rely on. Concurrent double-click claims still collapse to one award
// because the engine cooldown check runs before the ledger write.

export async function POST() {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const actor: Actor = { kind: 'player', playerId: session.player.id }
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await bonusEngine.awardBySlug(ctx, bonusEngine.BONUS_SLUGS.daily, {
    playerId: session.player.id,
    sourceKind: 'login',
    sourceId: `${session.player.id}:daily:${randomUUID()}`,
    context: { extra: { source: 'manual_claim' } },
    reason: 'Daily bonus — manual claim',
  })
  await queue.flush()

  if (!result.ok) {
    if (result.error.code === 'TEMPLATE_DISABLED') {
      return NextResponse.json(
        { awarded: false, error: 'unavailable', message: 'Daily bonus is currently disabled.' },
        { status: 200 },
      )
    }
    if (result.error.code === 'COOLDOWN_ACTIVE') {
      const retryHours = (result.error as { retryAfterHours?: number }).retryAfterHours ?? 24
      const retrySeconds = Math.ceil(retryHours * 3600)
      return NextResponse.json(
        {
          awarded: false,
          alreadyClaimed: true,
          retrySeconds,
          message: `Next daily bonus available in ${formatHms(retrySeconds)}.`,
        },
        { status: 200 },
      )
    }
    return NextResponse.json(
      {
        awarded: false,
        error: 'award_failed',
        message: `Could not claim daily bonus (${result.error.code}).`,
      },
      { status: 200 },
    )
  }

  const value = result.value
  if (value.status === 'duplicate') {
    return NextResponse.json(
      {
        awarded: false,
        alreadyClaimed: true,
        message: "You've already claimed your daily bonus.",
      },
      { status: 200 },
    )
  }
  if (value.status === 'pending') {
    // The daily bonus path never sets pendingClaim, so this branch is
    // unreachable in practice — narrow the type to satisfy TS without
    // adding noise to the response shape.
    return NextResponse.json(
      { awarded: false, error: 'unexpected_pending', message: 'Daily bonus could not be claimed.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    awarded: true,
    awardId: value.awardId,
    gc: formatCoins(value.gcAmount).split('.')[0] ?? '0',
    sc: formatCoins(value.scAmount).split('.')[0] ?? '0',
  })
}

function formatHms(seconds: number): string {
  if (seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
