import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { bonus as bonusEngine } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/dev/seed-pending-bonuses
//
// Dev-only smoke endpoint that drops two pending bonus awards into the
// authenticated player's inbox so the Pending Bonus tile can be tested
// without a live admin flow. Refuses to run in production.
//
// Awards:
//   1) Affiliate payout (Frenzy Creator) — 5 SC, 0x playthrough, redeemable
//      immediately.
//   2) Promotion grant (admin) — 5,000 GC + 2 SC, 3x SC playthrough.
//
// We write the bonuses_awarded rows directly rather than going through
// the engine because:
//   - The templates ship with award_gc=0/award_sc=0 (the real values
//     come from the affiliate-deal config or per-grant admin input in
//     production); the engine would refuse to award zero amounts.
//   - This is dev-only seed data — the real admin grant API (to be
//     built later) will use the engine with `pendingClaim: true`.

interface SeedResponse {
  ok: boolean
  granted: Array<{ awardId: string; bonusSlug: string; gc: string; sc: string }>
  skipped?: string[]
  error?: string
}

export async function POST() {
  // Fail-closed: only run when NODE_ENV is explicitly 'development' or
  // 'test'. Any other value (production, staging, missing, typo) → 403.
  const env = process.env.NODE_ENV
  if (env !== 'development' && env !== 'test') {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 })
  }
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const db = getDb()

  // Idempotent-ish guard: if the player already has any pending bonus,
  // don't pile more on. The popover's Claim button removes rows, so the
  // dev can call this again after clearing.
  const existing = await db
    .select({ id: schema.bonusesAwarded.id })
    .from(schema.bonusesAwarded)
    .where(
      and(
        eq(schema.bonusesAwarded.playerId, session.player.id),
        eq(schema.bonusesAwarded.status, 'pending'),
      ),
    )
    .limit(1)
  if (existing.length > 0) {
    return NextResponse.json({
      ok: true,
      granted: [],
      skipped: ['already_has_pending'],
    } satisfies SeedResponse)
  }

  const granted: SeedResponse['granted'] = []

  // 1) Affiliate payout — 5 SC, no playthrough.
  const affiliateBonus = await db
    .select({ id: schema.bonuses.id })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.slug, bonusEngine.BONUS_SLUGS.affiliatePayout))
    .limit(1)
  if (affiliateBonus[0]) {
    const awardId = randomUUID()
    const scAmount = 50_000n // 5 SC in minor units (1 SC = 10,000)
    await db.insert(schema.bonusesAwarded).values({
      id: awardId,
      playerId: session.player.id,
      bonusId: affiliateBonus[0].id,
      gcAmount: 0n,
      scAmount,
      playthroughMultiplierSnapshot: '0.00',
      playthroughRequired: 0n,
      playthroughProgress: 0n,
      playthroughComplete: true,
      status: 'pending',
      sourceKind: 'affiliate_payout',
      sourceId: `dev-seed:affiliate:${session.player.id}:${randomUUID()}`,
      awardReason: 'Dev seed — Frenzy Creator demo payout',
    })
    granted.push({
      awardId,
      bonusSlug: bonusEngine.BONUS_SLUGS.affiliatePayout,
      gc: '0',
      sc: scAmount.toString(),
    })
  }

  // 2) Admin grant — 5,000 GC + 2 SC, 3x SC playthrough.
  const grantBonus = await db
    .select({ id: schema.bonuses.id })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.slug, bonusEngine.BONUS_SLUGS.adminGrant))
    .limit(1)
  if (grantBonus[0]) {
    const awardId = randomUUID()
    const gcAmount = 50_000_000n // 5,000 GC in minor units
    const scAmount = 20_000n // 2 SC in minor units
    const playthroughRequired = 60_000n // 2 SC * 3x = 6 SC required
    await db.insert(schema.bonusesAwarded).values({
      id: awardId,
      playerId: session.player.id,
      bonusId: grantBonus[0].id,
      gcAmount,
      scAmount,
      playthroughMultiplierSnapshot: '3.00',
      playthroughRequired,
      playthroughProgress: 0n,
      playthroughComplete: false,
      status: 'pending',
      sourceKind: 'admin_manual',
      sourceId: `dev-seed:admin:${session.player.id}:${randomUUID()}`,
      awardReason: 'Dev seed — promotions bonus',
    })
    granted.push({
      awardId,
      bonusSlug: bonusEngine.BONUS_SLUGS.adminGrant,
      gc: gcAmount.toString(),
      sc: scAmount.toString(),
    })
  }

  return NextResponse.json({ ok: true, granted } satisfies SeedResponse)
}
