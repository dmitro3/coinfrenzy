import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { Clock } from 'lucide-react'

import { withActor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requirePlayerSession } from '@/lib/player-session'
import { formatCoins } from '@/lib/format'

import { AccountSubnav } from '../_subnav'
import { GameHistoryControls } from './_controls'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 + M5 — Account / Game History tab. Mirrors the live
// coinfrenzy.com screen: date-range pickers on the left, SC/GC toggle
// on the right, then the table (Game Id / Date & Time / Game Name /
// Stake / Win). The SC/GC filter lives in the client component below;
// for now it filters in-memory over the most recent 50 rounds.

export default async function GameHistoryPage() {
  const session = await requirePlayerSession('/account/game-history')

  const rows = await withActor(session.player.id, 'player', null, (tx) =>
    tx
      .select({
        id: schema.gameRounds.id,
        gameId: schema.gameRounds.gameId,
        gameName: schema.games.displayName,
        currency: schema.gameRounds.currency,
        wager: schema.gameRounds.betAmount,
        win: schema.gameRounds.winAmount,
        status: schema.gameRounds.status,
        startedAt: schema.gameRounds.betAt,
      })
      .from(schema.gameRounds)
      .innerJoin(schema.games, eq(schema.games.id, schema.gameRounds.gameId))
      .where(eq(schema.gameRounds.playerId, session.player.id))
      .orderBy(desc(schema.gameRounds.betAt))
      .limit(50),
  )

  const serializable = rows.map((r) => ({
    id: r.id,
    gameId: r.gameId.slice(-4),
    gameName: r.gameName,
    currency: r.currency as 'SC' | 'GC',
    wager: formatCoins(r.wager ?? 0n),
    win: formatCoins(r.win ?? 0n),
    startedAt: new Date(r.startedAt).toISOString(),
  }))

  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="cf-fade-up mb-4 flex items-center justify-between">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <Clock className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Account
        </h1>
      </header>

      <AccountSubnav />

      <section className="cf-fade-up mt-6" style={{ ['--cf-fade-delay' as string]: '180ms' }}>
        <h2 className="cf-headline mb-3 text-lg font-bold uppercase tracking-wider text-white">
          Game History
        </h2>

        {serializable.length === 0 ? (
          <div className="cf-account-card p-12 text-center text-sm text-[var(--cf-gray-light)]">
            No game history yet. Start playing in the{' '}
            <Link className="text-[var(--cf-gold-light)] underline" href="/lobby">
              lobby
            </Link>
            .
          </div>
        ) : (
          <GameHistoryControls rows={serializable} />
        )}
      </section>
    </div>
  )
}
