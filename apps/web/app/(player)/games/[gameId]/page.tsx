import type React from 'react'
import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'

import { games as gamesCore } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { getActiveCurrency, parseCurrencyParam } from '@/lib/active-currency'
import { buildWebhookContext } from '@/lib/webhook-context'
import { requirePlayerSession } from '@/lib/player-session'

import { GameFrame } from './_game-frame'
import { GameImmersiveFooter } from './_immersive-footer'
import { KycRequiredCard } from './_kyc-required-card'

export const dynamic = 'force-dynamic'

type Params = Promise<{ gameId: string }>
type SearchParams = Promise<{ currency?: string }>

// UUID v4 shape (8-4-4-4-12). We test the shape rather than the version
// digit because some legacy rows in dev use v1. Used to dispatch between
// the id-lookup and slug-lookup paths — Postgres rejects a non-UUID bind
// to a `uuid` column with `invalid input syntax for type uuid`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findGame(gameIdOrSlug: string) {
  const db = getDb()
  if (UUID_RE.test(gameIdOrSlug)) {
    return db.query.games.findFirst({
      where: and(eq(schema.games.id, gameIdOrSlug), isNull(schema.games.deletedAt)),
    })
  }
  return db.query.games.findFirst({
    where: and(eq(schema.games.slug, gameIdOrSlug), isNull(schema.games.deletedAt)),
  })
}

export default async function GameLaunchPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { gameId } = await params
  const sp = await searchParams
  const currency = parseCurrencyParam(sp.currency) ?? (await getActiveCurrency())
  const session = await requirePlayerSession(`/games/${gameId}`)
  const game = await findGame(gameId)

  if (!game) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white">
          Game not found
        </h1>
        <Link
          href="/casino-games"
          className="mt-4 inline-block text-sm font-semibold text-[var(--cf-gold-light)] underline"
        >
          ← Back to games
        </Link>
      </div>
    )
  }

  const { ctx } = buildWebhookContext('game-launch')
  const launch = await gamesCore.launchGame(ctx, {
    playerId: session.player.id,
    gameId: game.id,
    currency,
  })

  if (!launch.ok) {
    // KYC is the one error that gets its own client surface — we open
    // the Footprint popup right where the player landed instead of
    // sending them off to /account/kyc.
    if (launch.error.code === 'kyc_required') {
      return <KycRequiredCard gameDisplayName={game.displayName} />
    }
    const otherCurrency = currency === 'GC' ? 'SC' : 'GC'
    const messages: Record<Exclude<typeof launch.error.code, 'kyc_required'>, React.ReactNode> = {
      game_not_found: <>That game has been retired.</>,
      game_not_available: <>This game is temporarily offline. Try another title.</>,
      game_not_available_for_currency: (
        <>
          {game.displayName} isn&apos;t available in {currency}.{' '}
          <Link
            href={`/games/${game.slug}?currency=${otherCurrency}`}
            className="font-medium underline"
          >
            Try it in {otherCurrency}
          </Link>{' '}
          instead.
        </>
      ),
      wallet_missing: (
        <>Your {currency} wallet isn&apos;t initialized yet. Refresh and try again.</>
      ),
      self_excluded: <>Play is paused while your self-exclusion is active.</>,
    }
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white">
          {game.displayName}
        </h1>
        <div className="mt-6 rounded-md border border-[var(--cf-gold-deep)] bg-[#231804] p-4 text-sm text-[var(--cf-gold-light)]">
          {messages[launch.error.code]}
        </div>
        <Link
          href="/casino-games"
          className="mt-4 inline-block text-sm font-semibold text-[var(--cf-gold-light)] underline"
        >
          ← Back to games
        </Link>
      </div>
    )
  }

  // Immersive game-play layout — the shell hides its sidebar/footer/
  // ticker for `/games/{id}` so the iframe gets the full viewport
  // between the top bar and our own GameImmersiveFooter. Mirrors the
  // live coinfrenzy.com structure; ships ready for Alea sandbox
  // (or any provider) to drop into `playUrl` without further layout
  // changes.
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-black">
      <GameFrame src={launch.value.playUrl} title={game.displayName} />
      <GameImmersiveFooter
        gameId={game.id}
        gameDisplayName={game.displayName}
        currency={currency}
        sessionId={launch.value.sessionId}
      />
    </div>
  )
}
