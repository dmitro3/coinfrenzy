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

// GET /api/player/bonus/pending — list the player's pending bonus
// awards (admin grants, affiliate payouts, anything that requires an
// explicit claim before the coins land). Newest first.
//
// Shape is tuned for the Available Rewards popover: pre-formatted
// amounts, a human-readable source label, and a hint at whether
// playthrough applies. The popover itself doesn't need the playthrough
// number — it just decides what to show on the celebration screen.

interface PendingBonusPayload {
  awardId: string
  bonusSlug: string
  bonusName: string
  bonusType: string
  gc: string
  sc: string
  // Display-friendly source label ("Admin grant", "Frenzy Creator payout").
  sourceLabel: string
  hasPlaythrough: boolean
  playthroughMultiplier: number
  awardReason: string | null
  createdAt: string
}

function sourceLabel(kind: string | null, bonusType: string): string {
  if (kind === 'affiliate_payout') return 'Frenzy Creator payout'
  if (kind === 'promo_code') return 'Promo code'
  if (kind === 'admin_manual') return 'Admin grant'
  if (kind === 'crm_flow') return 'Promotion'
  if (bonusType === 'affiliate') return 'Frenzy Creator payout'
  if (bonusType === 'promotion') return 'Promotion'
  return 'Bonus'
}

export async function GET() {
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

  const rows = await bonusEngine.listPendingBonuses(ctx, session.player.id)

  const payload: PendingBonusPayload[] = rows.map((r) => ({
    awardId: r.awardId,
    bonusSlug: r.bonusSlug,
    bonusName: r.bonusName,
    bonusType: r.bonusType,
    gc: formatCoins(r.gcAmount).split('.')[0] ?? '0',
    sc: formatCoins(r.scAmount).split('.')[0] ?? '0',
    sourceLabel: sourceLabel(r.sourceKind, r.bonusType),
    hasPlaythrough: r.scAmount > 0n && r.playthroughRequired > 0n,
    playthroughMultiplier: r.playthroughMultiplier,
    awardReason: r.awardReason,
    createdAt: r.createdAt.toISOString(),
  }))

  return NextResponse.json({ pending: payload })
}
