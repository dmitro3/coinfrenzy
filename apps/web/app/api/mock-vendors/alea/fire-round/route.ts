import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { adapters } from '@coinfrenzy/core'
import { isMockEnabled } from '@coinfrenzy/config'
import { getDb, schema } from '@coinfrenzy/db'

interface Body {
  sessionId?: string
  gameId?: string
  token?: string
  currency?: 'GC' | 'SC'
  betCents?: number
  winRateBps?: number
}

// Helper used by the mock Alea play page. Picks a deterministic outcome
// for the spin (so tests can pin payouts via `winRateBps=10000`) and
// forwards the round through the same `fireMockAleaRound` helper used by
// the integration tests.

export async function POST(request: Request) {
  if (!isMockEnabled('alea')) {
    return NextResponse.json({ error: 'mock_alea_disabled' }, { status: 404 })
  }
  const body = (await request.json().catch(() => ({}))) as Body
  if (!body.sessionId || !body.gameId || !body.betCents) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }
  const currency = body.currency === 'SC' ? 'SC' : 'GC'

  const db = getDb()
  const session = await db.query.gameSessions.findFirst({
    where: eq(schema.gameSessions.id, body.sessionId),
  })
  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 })
  }

  const winRate = Math.max(0, Math.min(10_000, body.winRateBps ?? 5_000))
  const hit = Math.random() * 10_000 < winRate
  const winCents = hit ? Math.round(body.betCents * (1.5 + Math.random() * 2)) : 0

  // The UI tracks bets in "cents" (display shows betCents/100, so 500
  // reads as "5.00 SC"). The ledger lives in minor units where 1 major
  // = 10_000 minor (see packages/db/src/schema/_shared.ts MONEY_SCALE).
  // 1 cent = 1/100 major = 100 minor units. Without this conversion a
  // 500-cent bet would write 500 minor units (0.05 SC) to the ledger
  // and the player would never feel a balance change.
  const CENTS_TO_MINOR = 100n
  const result = await adapters.alea.fireMockAleaRound({
    casinoSessionId: session.id,
    playerId: session.playerId,
    externalGameId: body.gameId,
    amountMinor: BigInt(body.betCents) * CENTS_TO_MINOR,
    winAmountMinor: BigInt(winCents) * CENTS_TO_MINOR,
    currency,
  })

  return NextResponse.json({
    roundId: result.roundId,
    winCents,
    betDelivered: result.betDelivered,
    winDelivered: result.winDelivered,
  })
}
