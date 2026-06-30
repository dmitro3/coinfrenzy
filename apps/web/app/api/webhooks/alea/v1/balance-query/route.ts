import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'

import { adapters, ledger } from '@coinfrenzy/core'
import { isCoinCurrency } from '@coinfrenzy/config'

import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §5.3 — synchronous balance query. This is NOT the universal
// receiver pattern: Alea expects a JSON body in the response with the
// player's current balance within ~500ms. We verify the signature, read
// the wallet via the cached path, and respond inline.

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  const verification = await adapters.alea.verifyAleaWebhook(rawBody, headers)
  if (!verification.ok) {
    return NextResponse.json(
      { error: 'invalid_signature', reason: verification.error },
      { status: 401 },
    )
  }

  const parsed = JSON.parse(rawBody) as {
    playerId?: string
    currency?: string
    casinoSessionId?: string
  }

  if (!parsed.playerId || !parsed.currency || !isCoinCurrency(parsed.currency)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const { ctx } = buildWebhookContext('alea')
  const balance = await ledger.getBalance(ctx, parsed.playerId, parsed.currency)
  if (!balance.ok) {
    return NextResponse.json({ error: 'wallet_not_found' }, { status: 404 })
  }

  return NextResponse.json({
    balance: Number(balance.value.currentBalance),
    currency: parsed.currency,
    timestamp: new Date().toISOString(),
  })
}
