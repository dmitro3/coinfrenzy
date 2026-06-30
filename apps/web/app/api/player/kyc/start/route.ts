import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import {
  consoleLogger,
  createAfterCommitQueue,
  kyc,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §6.1-§6.2 — start a Footprint onboarding session for the player.
//
// In mock mode (USE_MOCK_FOOTPRINT=true) the URL points at our in-app
// /mock-vendors/footprint/onboarding page, which auto-completes after a
// short delay and fires the onboarding-completed webhook. In real mode
// the URL is the hosted Footprint flow.

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Allow callers to suggest a return URL (e.g. /cashier/redeem). Defaults
  // to the account/kyc page so the player sees their level update post-flow.
  const url = new URL(req.url)
  const returnUrl = url.searchParams.get('returnUrl') ?? undefined

  const actor: Actor = { kind: 'player', playerId: session.player.id }
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await kyc.startKycOnboarding(ctx, {
    playerId: session.player.id,
    email: session.player.email,
    returnUrl,
  })
  await queue.flush()

  if (!result.ok) {
    return NextResponse.json({ error: result.error.code }, { status: 400 })
  }

  return NextResponse.json({
    stubbed: result.value.stubbed,
    url: result.value.url,
    validationToken: result.value.validationToken,
    footprintUserId: result.value.footprintUserId,
  })
}
