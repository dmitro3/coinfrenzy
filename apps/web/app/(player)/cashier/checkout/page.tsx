import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { env, isMockEnabled } from '@coinfrenzy/config'
import { getDb, schema } from '@coinfrenzy/db'

import { getPlayerSession } from '@/lib/player-session'

import { FinixCheckoutClient } from './_client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §3 — real Finix Hosted Fields checkout page.
//
// This page is the destination URL returned by /api/player/purchase/start
// when USE_MOCK_FINIX=false. We mount the iframes server-side (script
// tag injection happens client-side) so the player never leaves our
// domain — the only thing reaching Finix is the encrypted card data
// inside their iframes.
//
// In mock mode the start endpoint redirects to /mock-vendors/finix/checkout
// instead and this page is unreachable; we still guard against that.

interface PageProps {
  searchParams: Promise<{
    purchaseId?: string
    intentId?: string
  }>
}

export default async function CashierCheckoutPage({ searchParams }: PageProps) {
  const session = await getPlayerSession()
  if (!session) redirect('/login?next=/cashier/buy')

  if (isMockEnabled('finix')) {
    // In mock mode this page would 503 on the client because the public
    // Finix script isn't loaded. Send people back through the start flow.
    redirect('/cashier/buy')
  }

  const { purchaseId, intentId } = await searchParams
  if (!purchaseId) redirect('/cashier/buy')

  const db = getDb()
  const purchase = await db.query.purchases.findFirst({
    where: eq(schema.purchases.id, purchaseId),
  })
  if (!purchase || purchase.playerId !== session.player.id) {
    redirect('/cashier/buy?error=purchase_not_found')
  }
  if (purchase.status !== 'pending') {
    redirect('/account?purchase=already_processed')
  }

  const pkg = purchase.packageId
    ? await db.query.packages.findFirst({ where: eq(schema.packages.id, purchase.packageId) })
    : null

  const e = env()
  if (!e.NEXT_PUBLIC_FINIX_APPLICATION_ID) {
    redirect('/cashier/buy?error=finix_not_configured')
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Complete your purchase</h1>
        <p className="text-sm text-muted-foreground">
          Card details are entered directly into Finix and never touch our servers.
        </p>
      </header>
      <FinixCheckoutClient
        purchaseId={purchase.id}
        intentId={intentId ?? ''}
        amountCents={Number(purchase.amountCents)}
        packageName={pkg?.displayName ?? 'Coin package'}
        finixApplicationId={e.NEXT_PUBLIC_FINIX_APPLICATION_ID!}
        finixEnvironment={e.NEXT_PUBLIC_FINIX_ENVIRONMENT}
        successUrl="/account?purchase=success"
        cancelUrl="/cashier/buy?purchase=cancelled"
      />
    </main>
  )
}
