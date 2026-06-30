import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { isMockEnabled } from '@coinfrenzy/config'
import { adapters as coreAdapters } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §3 — second leg of the real Finix Hosted Fields flow.
//
// `/api/player/purchase/start` returns a URL to /cashier/checkout; the
// client there mounts Finix's Hosted Fields, the player enters a card,
// Finix returns a payment_instrument_id, and the client POSTs it to this
// endpoint. We then:
//   1. Verify the purchase row belongs to this player + is still pending.
//   2. Call finix.createTransfer with the tokenized instrument id.
//   3. Replace the intent-prefixed finix_transfer_id with the real id so
//      the eventual webhook can match us.
//   4. Return success + the success/cancel URL the client should redirect to.
//
// The webhook handler completes the ledger writes — this endpoint never
// touches the ledger directly.

const confirmBody = z.object({
  purchaseId: z.string().uuid(),
  paymentInstrumentId: z.string().min(1).max(128),
})

export async function POST(req: NextRequest) {
  if (isMockEnabled('finix')) {
    return NextResponse.json(
      { error: 'mock_mode', detail: 'Use the mock checkout page when USE_MOCK_FINIX=true.' },
      { status: 400 },
    )
  }

  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let parsed
  try {
    parsed = confirmBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()
  const purchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, parsed.purchaseId),
      eq(schema.purchases.playerId, session.player.id),
    ),
  })
  if (!purchase) {
    return NextResponse.json({ error: 'purchase_not_found' }, { status: 404 })
  }
  if (purchase.status !== 'pending') {
    return NextResponse.json(
      { error: 'purchase_not_pending', currentStatus: purchase.status },
      { status: 409 },
    )
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null

  let transferResult
  try {
    const finix = coreAdapters.finix.getFinixClient()
    transferResult = await finix.createTransfer({
      purchaseId: purchase.id,
      playerId: purchase.playerId,
      paymentInstrumentId: parsed.paymentInstrumentId,
      amountCents: purchase.amountCents,
      currency: 'USD',
      tags: {
        purchase_id: purchase.id,
        player_id: purchase.playerId,
        promo_code: purchase.promoCode ?? '',
      },
      ip,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'finix_create_transfer_failed',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }

  await db
    .update(schema.purchases)
    .set({
      finixTransferId: transferResult.transferId,
      finixPaymentInstrumentId: parsed.paymentInstrumentId,
      updatedAt: new Date(),
    })
    .where(eq(schema.purchases.id, purchase.id))

  // The transfer's terminal state may already be SUCCEEDED if Finix
  // posted synchronously (uncommon — they usually go through PENDING).
  // We never commit the ledger from this path; the webhook is the only
  // ledger trigger so we don't risk double-crediting.
  return NextResponse.json({
    ok: true,
    purchaseId: purchase.id,
    finixTransferId: transferResult.transferId,
    state: transferResult.state,
    successUrl: '/account?purchase=success',
    cancelUrl: '/cashier/buy?purchase=cancelled',
  })
}
