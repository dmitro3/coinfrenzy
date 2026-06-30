import Image from 'next/image'
import Link from 'next/link'

import { isMockEnabled } from '@coinfrenzy/config'

import { getActiveCurrency } from '@/lib/active-currency'
import { loadGamesCatalog, type CatalogGame } from '@/lib/games-catalog'

export const dynamic = 'force-dynamic'

export default async function GamesLobbyPage() {
  const currency = await getActiveCurrency()
  const games = await loadGamesCatalog({ currency })

  // Group by provider for the secondary "Browse by studio" rail.
  const byProvider = new Map<string, { displayName: string; games: CatalogGame[] }>()
  for (const game of games) {
    const bucket = byProvider.get(game.providerSlug) ?? {
      displayName: game.providerDisplayName,
      games: [],
    }
    bucket.games.push(game)
    byProvider.set(game.providerSlug, bucket)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">All games</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing games playable in <span className="font-medium">{currency}</span>
            {isMockEnabled('alea') ? ' · powered by Alea (mock mode)' : ' · powered by Alea'}
          </p>
        </div>
      </header>

      {games.length === 0 ? (
        <EmptyState currency={currency} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {games.map((game) => (
              <GameTile key={game.id} game={game} currency={currency} />
            ))}
          </div>

          <section className="mt-12 space-y-10">
            <h2 className="text-lg font-semibold">Browse by studio</h2>
            {Array.from(byProvider.entries()).map(([slug, bucket]) => (
              <div key={slug}>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  {bucket.displayName}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {bucket.games.map((game) => (
                    <GameTile key={game.id} game={game} currency={currency} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

function EmptyState({ currency }: { currency: 'GC' | 'SC' }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
      No games available for <span className="font-medium">{currency}</span> right now. Toggle to{' '}
      <span className="font-medium">{currency === 'GC' ? 'SC' : 'GC'}</span> at the top of the page
      to keep browsing.
    </div>
  )
}

function GameTile({ game, currency }: { game: CatalogGame; currency: 'GC' | 'SC' }) {
  return (
    <Link
      href={`/games/${game.slug}?currency=${currency}`}
      className="group relative block overflow-hidden rounded-lg border border-border/60 bg-card transition hover:border-border"
    >
      <div className="relative aspect-[3/4] w-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-500">
        {game.thumbnailUrl ? (
          <Image
            src={game.thumbnailUrl}
            alt={game.displayName}
            fill
            sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center text-2xl font-bold leading-none text-white drop-shadow">
            {game.displayName
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 3)}
          </div>
        )}
        {game.isFeatured && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-950">
            Featured
          </span>
        )}
        {game.isNew && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950">
            New
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="truncate text-sm font-medium">{game.displayName}</div>
        <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
          {game.providerDisplayName}
          {game.rtp ? ` · ${(Number(game.rtp) * 100).toFixed(1)}% RTP` : ''}
        </div>
      </div>
    </Link>
  )
}
