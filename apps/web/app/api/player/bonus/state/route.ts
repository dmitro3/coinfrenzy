import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { bonus as bonusEngine } from '@coinfrenzy/core'

const BONUS_SLUGS = bonusEngine.BONUS_SLUGS

import { getPlayerSession } from '@/lib/player-session'
import { formatCoins } from '@/lib/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/06 §13 — exposes the player-facing daily bonus state to the
// Available Rewards popover. The popover needs to know:
//   • can the player claim right now? (no claim in the last 24h)
//   • if not, how many seconds until the rolling 24h elapses
//     (counting from the moment of the last claim — NOT until UTC
//      midnight, which would force the player to wait an unfair
//      amount if they claimed late in the UTC day)
//   • how big is today's award? (so the tile can show "10,000 GC + 1 SC")
//
// We intentionally read directly from `bonuses` + `bonuses_awarded`
// rather than going through a heavier core helper — this endpoint is
// hit every time the popover opens, so it has to be cheap.

interface DailyState {
  claimable: boolean
  /** Seconds until the next claim is available; null when claimable now. */
  cooldownSecondsRemaining: number | null
  /** Total cooldown window in seconds (e.g. 24h = 86400) for progress UI. */
  cooldownTotalSeconds: number
  /** ISO timestamp of when the next claim becomes available; null if now. */
  nextClaimableAt: string | null
  awardGc: string
  awardSc: string
}

export async function GET() {
  const session = await getPlayerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getDb()
  const now = new Date()

  // Resolve the daily bonus template so we can show the award size and
  // honour any operator-configured cooldown override.
  const [template] = await db
    .select({
      id: schema.bonuses.id,
      awardGc: schema.bonuses.awardGc,
      awardSc: schema.bonuses.awardSc,
      cooldownHours: schema.bonuses.cooldownHours,
      status: schema.bonuses.status,
    })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.slug, BONUS_SLUGS.daily))
    .limit(1)

  // Default to 24h if the template doesn't set one — the seed sets 24
  // explicitly but we keep this fallback for safety.
  const cooldownHours = template?.cooldownHours ?? 24
  const cooldownTotalSeconds = cooldownHours * 3600

  if (!template || template.status !== 'active') {
    return NextResponse.json({
      daily: {
        claimable: false,
        cooldownSecondsRemaining: cooldownTotalSeconds,
        cooldownTotalSeconds,
        nextClaimableAt: null,
        awardGc: '0',
        awardSc: '0',
      } satisfies DailyState,
    })
  }

  // True rolling cooldown — find the most recent active/completed daily
  // bonus for this player. Pending rows do NOT count as a "claim" since
  // the coins haven't moved yet (the player would never see a daily
  // bonus as pending, but the engine could in principle, so we filter
  // by status to be safe).
  const [last] = await db
    .select({ createdAt: schema.bonusesAwarded.createdAt })
    .from(schema.bonusesAwarded)
    .where(
      and(
        eq(schema.bonusesAwarded.playerId, session.player.id),
        eq(schema.bonusesAwarded.bonusId, template.id),
      ),
    )
    .orderBy(desc(schema.bonusesAwarded.createdAt))
    .limit(1)

  let claimable = true
  let cooldownSecondsRemaining: number | null = null
  let nextClaimableAt: string | null = null

  if (last?.createdAt) {
    const nextAt = new Date(last.createdAt.getTime() + cooldownHours * 3_600_000)
    if (nextAt > now) {
      claimable = false
      cooldownSecondsRemaining = Math.max(0, Math.ceil((nextAt.getTime() - now.getTime()) / 1000))
      nextClaimableAt = nextAt.toISOString()
    }
  }

  const daily: DailyState = {
    claimable,
    cooldownSecondsRemaining,
    cooldownTotalSeconds,
    nextClaimableAt,
    awardGc: formatCoins(template.awardGc).split('.')[0]!,
    awardSc: formatCoins(template.awardSc).split('.')[0]!,
  }

  return NextResponse.json({ daily })
}
