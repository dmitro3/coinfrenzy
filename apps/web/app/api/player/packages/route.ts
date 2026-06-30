import { NextResponse } from 'next/server'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'

import { formatCoins } from '@/lib/format'
import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/10 §4.2 — Shop modal's client-side package fetch.
//
// Players see different package sets depending on whether they've made
// a paid purchase yet:
//   - hasFirstPurchase === false  → ONLY firstPurchaseOnly=true packages
//   - hasFirstPurchase === true   → ONLY firstPurchaseOnly=false packages
//
// Featured slots are returned separately so the modal can render them as
// big banner cards above the regular package grid. Featured packages are
// also filtered by the same first-purchase rule (a welcome bundle can't
// occupy a slot for an existing customer).

function formatUsdPrice(minor: bigint): string {
  // priceUsd is bigint at 10^-4 USD scale; minor / 10000 = dollars.
  const dollars = Number(minor / 10_000n)
  return `$${dollars}`
}

export async function GET() {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getDb()

  // Has the player completed any paid purchase? Use the lifetime stats
  // row (denormalised on purchase.completed) for a single quick read.
  const lifetime = await db
    .select({ firstPurchaseAt: schema.playerLifetimeStats.firstPurchaseAt })
    .from(schema.playerLifetimeStats)
    .where(eq(schema.playerLifetimeStats.playerId, session.player.id))
    .limit(1)
  const hasFirstPurchase = lifetime[0]?.firstPurchaseAt != null

  const rows = await db
    .select({
      id: schema.packages.id,
      displayName: schema.packages.displayName,
      promotionalLabel: schema.packages.promotionalLabel,
      badgeColor: schema.packages.badgeColor,
      priceUsd: schema.packages.priceUsd,
      baseGc: schema.packages.baseGc,
      baseSc: schema.packages.baseSc,
      bonusGc: schema.packages.bonusGc,
      bonusSc: schema.packages.bonusSc,
      featuredSlot: schema.packages.featuredSlot,
      bannerHeadline: schema.packages.bannerHeadline,
      bannerSubhead: schema.packages.bannerSubhead,
      bannerImageUrl: schema.packages.bannerImageUrl,
      firstPurchaseOnly: schema.packages.firstPurchaseOnly,
      sortOrder: schema.packages.sortOrder,
    })
    .from(schema.packages)
    .where(
      and(
        eq(schema.packages.status, 'active'),
        eq(schema.packages.firstPurchaseOnly, !hasFirstPurchase),
        isNull(schema.packages.deletedAt),
      ),
    )
    .orderBy(asc(schema.packages.sortOrder), asc(schema.packages.displayName))

  // Featured slots (slot 1 and slot 2) shared across both flows — we
  // also intersect by the first-purchase rule above so a welcome banner
  // doesn't show to existing customers and vice versa.
  const featuredRows = rows.filter((p) => p.featuredSlot !== null)
  const featured = featuredRows
    .sort((a, b) => (a.featuredSlot ?? 99) - (b.featuredSlot ?? 99))
    .map(mapPackage)

  const packages = rows.filter((p) => p.featuredSlot === null).map(mapPackage)

  return NextResponse.json({
    packages,
    featured,
    welcomeMode: !hasFirstPurchase,
  })

  // unused but kept in case we need to re-add a debug logger
  void isNotNull
}

function mapPackage(pkg: {
  id: string
  displayName: string
  promotionalLabel: string | null
  badgeColor: string | null
  priceUsd: bigint
  baseGc: bigint
  baseSc: bigint
  bonusGc: bigint
  bonusSc: bigint
  featuredSlot: number | null
  bannerHeadline: string | null
  bannerSubhead: string | null
  bannerImageUrl: string | null
  firstPurchaseOnly: boolean
}) {
  // Show the TOTAL gold-coin grant on the card (base + bonus) so players
  // see the headline "30,000 GC" instead of just the base amount. The SC
  // line does the same.
  const totalGc = pkg.baseGc + pkg.bonusGc
  const totalSc = pkg.baseSc + pkg.bonusSc
  return {
    id: pkg.id,
    displayName: pkg.displayName,
    goldCoins: formatCoins(totalGc).split('.')[0]!,
    bonusSweeps: totalSc > 0n ? formatCoins(totalSc).split('.')[0]! : null,
    priceUsd: formatUsdPrice(pkg.priceUsd),
    badge: pkg.promotionalLabel,
    badgeColor: pkg.badgeColor,
    featuredSlot: pkg.featuredSlot,
    bannerHeadline: pkg.bannerHeadline,
    bannerSubhead: pkg.bannerSubhead,
    bannerImageUrl: pkg.bannerImageUrl,
    welcome: pkg.firstPurchaseOnly,
  }
}
