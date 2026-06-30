import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { adapters } from '@coinfrenzy/core'
import { isMockEnabled } from '@coinfrenzy/config'
import { getDb, schema } from '@coinfrenzy/db'

interface Body {
  transferId?: string
  purchaseId?: string
  outcome?: 'succeeded' | 'failed' | 'disputed'
}

// Helper used by the mock Finix Hosted Fields page. The mock adapter
// already fires a `transfer.succeeded` on a timer when `createTransfer` is
// called; this endpoint exists for the manual demo flow where an operator
// wants to override the outcome (failed/disputed) from the UI.

export async function POST(request: Request) {
  if (!isMockEnabled('finix')) {
    return NextResponse.json({ error: 'mock_finix_disabled' }, { status: 404 })
  }
  const body = (await request.json().catch(() => ({}))) as Body
  if (!body.transferId || !body.purchaseId) {
    return NextResponse.json({ error: 'missing_ids' }, { status: 400 })
  }
  const outcome = body.outcome ?? 'succeeded'

  const db = getDb()
  const purchase = await db.query.purchases.findFirst({
    where: eq(schema.purchases.id, body.purchaseId),
  })
  if (!purchase) {
    return NextResponse.json({ error: 'purchase_not_found' }, { status: 404 })
  }

  const tags = {
    purchase_id: purchase.id,
    player_id: purchase.playerId,
    package_id: purchase.packageId ?? '',
  }

  const payload = adapters.finix.buildFinixTransferSucceededPayload({
    transferId: body.transferId,
    amountCents: BigInt(purchase.amountCents),
    tags,
    operationKey: 'CARD_NOT_PRESENT_SALE',
    state: outcome === 'succeeded' ? 'SUCCEEDED' : 'FAILED',
    failureCode: outcome === 'succeeded' ? undefined : 'card_declined',
    failureMessage: outcome === 'succeeded' ? undefined : 'Card declined by issuer',
  })

  if (outcome === 'disputed') {
    payload.type = 'dispute.created'
    ;(payload.entity as Record<string, unknown>).reason_code = '4855'
    ;(payload.entity as Record<string, unknown>).amount = Number(purchase.amountCents)
  }

  const rawBody = JSON.stringify(payload)
  const signature = adapters.finix.signMockFinixBody(rawBody)
  const url = new URL('/api/webhooks/finix/v1', request.url)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'finix-signature': signature,
    },
    body: rawBody,
  })

  return NextResponse.json({
    delivered: res.ok,
    status: res.status,
    outcome,
  })
}
