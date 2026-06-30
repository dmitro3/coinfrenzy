import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
  consoleLogger,
  createAfterCommitQueue,
  redemption as redemptionMod,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { adapters } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getPlayerSession } from '@/lib/player-session'
import { sendInngestEvent } from '@/lib/inngest-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §3.2 — POST /api/player/redemptions creates a redemption.
// GET returns the player's recent redemptions for the cashier history view.

const postBody = z.object({
  amountSc: z.string().regex(/^\d+(\.\d{1,4})?$/, 'invalid_amount'),
  method: z.enum(['finix_ach', 'apt_debit']),
  paymentInstrumentId: z.string().uuid().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let parsed: z.infer<typeof postBody>
  try {
    parsed = postBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null

  // Plumb the request IP through Radar for the eligibility check (vpn /
  // jurisdiction). In mock mode this returns the player's signup state.
  const geo = await adapters.radar.resolveIp(ip).catch(() => null)

  const amountSc = parseAmountToBigint(parsed.amountSc)

  const actor: Actor = { kind: 'player', playerId: session.player.id }
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await redemptionMod.createRedemption(ctx, {
    playerId: session.player.id,
    amountSc,
    method: parsed.method,
    paymentInstrumentId: parsed.paymentInstrumentId ?? null,
    ipAtRequest: ip,
    stateAtRequest: session.player.state ?? null,
    ipState: geo?.state ?? null,
    isProxy: geo?.isProxy === true || geo?.isVpn === true,
  })
  await queue.flush()

  if (!result.ok) {
    if (result.error.code === 'INELIGIBLE') {
      return NextResponse.json(
        {
          error: 'ineligible',
          reason: result.error.detail.code,
          detail: result.error.detail.detail,
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: result.error.code }, { status: 400 })
  }

  // If auto-approved, fan out the Finix submission via Inngest. We don't
  // submit synchronously so the player's response time isn't tied to a
  // round trip to Finix; the worker picks it up immediately.
  if (result.value.status === 'approved') {
    await sendInngestEvent({
      name: 'redemption/submit-to-finix',
      data: { redemptionId: result.value.id },
    })
  }

  return NextResponse.json({
    redemption: serializeRedemption(result.value),
  })
}

export async function GET() {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.redemptions)
    .where(eq(schema.redemptions.playerId, session.player.id))
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(50)

  return NextResponse.json({
    redemptions: rows.map((r) => serializeRedemption(redemptionMod.rowToRecord(r))),
  })
}

function parseAmountToBigint(raw: string): bigint {
  const [whole = '0', frac = ''] = raw.split('.')
  const fracPadded = frac.padEnd(4, '0').slice(0, 4)
  return BigInt(whole) * 10_000n + BigInt(fracPadded || '0')
}

function serializeRedemption(r: ReturnType<typeof redemptionMod.rowToRecord>) {
  return {
    id: r.id,
    amountSc: r.amountSc.toString(),
    amountUsd: r.amountUsd.toString(),
    method: r.method,
    status: r.status,
    paymentInstrumentId: r.paymentInstrumentId,
    finixTransferId: r.finixTransferId,
    rejectionReason: r.rejectionReason,
    rejectionCategory: r.rejectionCategory,
    failureReason: r.failureReason,
    requestedAt: r.requestedAt.toISOString(),
    submittedToFinixAt: r.submittedToFinixAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}
