import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env, isMockEnabled } from '@coinfrenzy/config'
import { getDb, schema } from '@coinfrenzy/db'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/02 §6 + docs/05 §3 — purchase intent.
//
// Creates a `purchases` row in `pending` and returns the URL the player
// should be sent to for card capture. In mock mode that's our in-app
// `/mock-vendors/finix/checkout` page; in real mode the real Finix
// adapter wires Hosted Fields directly into the page so this endpoint
// would instead return an embed token. For prompt 06 we only need the
// mock leg — the real leg lands when we go live with Finix.

const startBody = z.object({
  packageId: z.string().uuid(),
  promoCode: z.string().trim().min(1).max(64).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let parsed
  try {
    parsed = startBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()
  const pkg = await db.query.packages.findFirst({
    where: eq(schema.packages.id, parsed.packageId),
  })
  if (!pkg || pkg.status !== 'active' || pkg.deletedAt !== null) {
    return NextResponse.json({ error: 'package_unavailable' }, { status: 404 })
  }

  // docs/03 §5.4 — welcome packages are gated to brand-new players.
  // Standard packages are gated to players who've completed a first
  // purchase. We enforce here so a client can't grab a welcome package
  // id after their welcome window has closed.
  const lifetime = await db.query.playerLifetimeStats.findFirst({
    where: eq(schema.playerLifetimeStats.playerId, session.player.id),
    columns: { firstPurchaseAt: true },
  })
  const hasFirstPurchase = lifetime?.firstPurchaseAt != null
  if (pkg.firstPurchaseOnly && hasFirstPurchase) {
    return NextResponse.json({ error: 'welcome_package_no_longer_available' }, { status: 410 })
  }
  if (!pkg.firstPurchaseOnly && !hasFirstPurchase) {
    return NextResponse.json(
      { error: 'standard_package_locked_until_welcome_used' },
      { status: 410 },
    )
  }

  // priceUsd is bigint minor units (10_000 per major). amountCents is bigint
  // cents (100 per major). Convert here so the purchase row matches the
  // Finix transfer.amount we'll receive on the webhook.
  const amountCents = pkg.priceUsd / 100n
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null

  const purchaseId = randomUUID()
  const transferId = `TR_intent_${randomUUID().replace(/-/g, '').slice(0, 18)}`

  await db.insert(schema.purchases).values({
    id: purchaseId,
    playerId: session.player.id,
    packageId: pkg.id,
    amountUsd: pkg.priceUsd,
    amountCents,
    baseGc: pkg.baseGc,
    baseSc: pkg.baseSc,
    bonusGc: pkg.bonusGc,
    bonusSc: pkg.bonusSc,
    promoCode: parsed.promoCode ?? null,
    finixTransferId: transferId,
    status: 'pending',
    ipAtPurchase: ip,
    stateAtPurchase: session.player.state,
  })

  // Build the URL the client should redirect to for card capture.
  if (isMockEnabled('finix')) {
    const base = env().PLAYER_BASE_URL ?? new URL(req.url).origin
    const successUrl = `${base}/account?purchase=success`
    const cancelUrl = `${base}/cashier/buy?purchase=cancelled`
    const url = new URL('/mock-vendors/finix/checkout', base)
    url.searchParams.set('purchaseId', purchaseId)
    url.searchParams.set('transferId', transferId)
    url.searchParams.set('amount', amountCents.toString())
    url.searchParams.set('currency', 'USD')
    url.searchParams.set('packageName', pkg.displayName)
    url.searchParams.set('successUrl', successUrl)
    url.searchParams.set('cancelUrl', cancelUrl)
    return NextResponse.json({
      purchaseId,
      transferId,
      url: url.toString(),
      mode: 'mock',
    })
  }

  // Real Finix Hosted Fields flow. We do NOT create the transfer here —
  // the client mounts Finix's Hosted Fields iframes on our /cashier/checkout
  // page, tokenizes the card → returns a payment_instrument_id → POSTs it
  // to /api/player/purchase/confirm, which calls the real Finix API. The
  // purchase row's finix_transfer_id is updated from our pre-issued intent
  // value to the real Finix transfer id at confirmation time.
  const e = env()
  if (!e.FINIX_API_KEY || !e.NEXT_PUBLIC_FINIX_APPLICATION_ID) {
    return NextResponse.json(
      {
        error: 'finix_not_configured',
        detail:
          'FINIX_API_KEY and NEXT_PUBLIC_FINIX_APPLICATION_ID must be set when USE_MOCK_FINIX=false.',
      },
      { status: 503 },
    )
  }
  const base = e.PLAYER_BASE_URL ?? new URL(req.url).origin
  const checkoutUrl = new URL('/cashier/checkout', base)
  checkoutUrl.searchParams.set('purchaseId', purchaseId)
  checkoutUrl.searchParams.set('intentId', transferId)
  return NextResponse.json({
    purchaseId,
    transferId,
    url: checkoutUrl.toString(),
    mode: 'real',
    finix: {
      applicationId: e.NEXT_PUBLIC_FINIX_APPLICATION_ID,
      environment: e.NEXT_PUBLIC_FINIX_ENVIRONMENT,
    },
  })
}
