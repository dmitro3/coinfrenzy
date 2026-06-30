import { NextResponse } from 'next/server'

import { legal as coreLegal } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §3.7 — read the current TOS/Privacy and the player's
// outstanding acceptances. The player shell polls this on mount; if
// `outstanding` is non-empty, the banner is shown.

export async function GET() {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const db = getDb()
  const [tos, privacy, outstanding] = await Promise.all([
    coreLegal.getCurrentTerms(db, 'tos'),
    coreLegal.getCurrentTerms(db, 'privacy'),
    coreLegal.getOutstandingAcceptances(db, session.player.id),
  ])

  return NextResponse.json({
    current: {
      tos: tos
        ? {
            version: tos.version,
            title: tos.title,
            summary: tos.summary,
            effectiveAt: tos.effectiveAt,
          }
        : null,
      privacy: privacy
        ? {
            version: privacy.version,
            title: privacy.title,
            summary: privacy.summary,
            effectiveAt: privacy.effectiveAt,
          }
        : null,
    },
    outstanding: outstanding.map((o) => ({
      slug: o.slug,
      currentVersion: o.currentVersion,
      acceptedVersion: o.acceptedVersion,
      title: o.title,
      summary: o.summary,
    })),
  })
}
