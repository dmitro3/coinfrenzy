import { NextResponse } from 'next/server'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'

import { isMockEnabled } from '@coinfrenzy/config'
import { getDb, schema } from '@coinfrenzy/db'

import { formatCoins } from '@/lib/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/10 §7 + M5 — the Live Wins ticker queries this endpoint every
// 15 seconds while the player browses the lobby. Returns the last ~50
// resolved SC wins above a small threshold so the ticker never goes
// quiet on a busy night. Player handles are masked (first two characters
// + asterisks) so we never leak full emails.

interface RecentWinDto {
  id: string
  playerHandle: string
  gameSlug: string
  gameName: string
  thumbnailUrl: string | null
  amountSc: string
  wonAt: string
}

export async function GET() {
  const db = getDb()

  // Threshold: 1 cent SC in minor units (1 SC = 10_000 minor; 0.01 SC = 100 minor)
  // The screenshots show wins down to 0.04 SC so we go to 100 minor (0.01 SC).
  const minWinMinor = 100n

  const rows = await db
    .select({
      id: schema.gameRounds.id,
      wonAt: schema.gameRounds.wonAt,
      winAmount: schema.gameRounds.winAmount,
      gameSlug: schema.games.slug,
      gameName: schema.games.displayName,
      thumbnailUrl: schema.games.thumbnailUrl,
      playerHandle: sql<string>`coalesce(${schema.players.username}, split_part(${schema.players.email}, '@', 1))`,
    })
    .from(schema.gameRounds)
    .innerJoin(schema.games, eq(schema.games.id, schema.gameRounds.gameId))
    .innerJoin(schema.players, eq(schema.players.id, schema.gameRounds.playerId))
    .where(
      and(
        eq(schema.gameRounds.status, 'resolved'),
        eq(schema.gameRounds.currency, 'SC'),
        gt(schema.gameRounds.winAmount, sql.raw(minWinMinor.toString())),
      ),
    )
    .orderBy(desc(schema.gameRounds.wonAt))
    .limit(50)

  let items: RecentWinDto[] = rows.map((r) => ({
    id: r.id,
    playerHandle: maskHandle(r.playerHandle),
    gameSlug: r.gameSlug,
    gameName: r.gameName,
    thumbnailUrl: r.thumbnailUrl,
    amountSc: formatCoins(r.winAmount),
    wonAt: (r.wonAt ?? new Date()).toISOString(),
  }))

  // docs/10 §7 fallback — when there aren't enough real wins to fill the
  // ticker (fresh DB, dev mode, or a quiet hour), pad with synthetic
  // wins drawn from the live game catalog so the rail still scrolls.
  // Only active in mock mode so real production traffic shows real data.
  if (items.length < 12 && isMockEnabled('alea')) {
    const fillerGames = await db
      .select({
        slug: schema.games.slug,
        displayName: schema.games.displayName,
        thumbnailUrl: schema.games.thumbnailUrl,
      })
      .from(schema.games)
      .where(
        and(
          eq(schema.games.status, 'active'),
          eq(schema.games.customerFacing, true),
          isNull(schema.games.deletedAt),
        ),
      )
      .limit(40)

    const synthetic: RecentWinDto[] = fillerGames
      .filter((g) => g.thumbnailUrl)
      .map((g, i) => ({
        id: `synthetic-${i}`,
        playerHandle: SYNTH_HANDLES[i % SYNTH_HANDLES.length]!,
        gameSlug: g.slug,
        gameName: g.displayName,
        thumbnailUrl: g.thumbnailUrl,
        amountSc: SYNTH_AMOUNTS[i % SYNTH_AMOUNTS.length]!,
        wonAt: new Date(Date.now() - i * 60_000).toISOString(),
      }))

    items = [...items, ...synthetic].slice(0, 50)
  }

  return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } })
}

// Masked handles + win amounts used to pad the ticker when the DB has
// few or no real rounds. Values picked to match the live-site cadence
// (0.04 – 0.37 SC, mostly small wins).
const SYNTH_HANDLES = [
  'Bra****',
  'Blu****',
  'Cor****',
  'Dan****',
  'Eve****',
  'Fox****',
  'Geo****',
  'Hax****',
  'Ivy****',
  'Jay****',
  'Kim****',
  'Leo****',
  'Mia****',
  'Nat****',
  'Oli****',
  'Pat****',
]
const SYNTH_AMOUNTS = [
  '0.09',
  '0.11',
  '0.04',
  '0.13',
  '0.10',
  '0.37',
  '0.05',
  '0.08',
  '0.15',
  '0.22',
  '0.06',
  '0.18',
]

// Mask handles per the live site ("@Blu****", "@Bra****") so a casual
// glance reveals only the first 3 characters. Empty/short handles fall
// back to `Player`.
function maskHandle(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'Player'
  const head = trimmed.slice(0, 3)
  return `${head}****`
}
