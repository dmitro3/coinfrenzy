'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'

import { cn } from '../lib/utils'
import { useFavoritesContext } from './FavoritesContext'
import { haptic, hapticPatterns } from './motion-primitives'
import { useToast } from './Toast'

export interface GameTileData {
  /**
   * UUID - required for the favorites star to render. When omitted (e.g.
   * synthetic placeholder tiles), the star button is suppressed.
   */
  id?: string
  slug: string
  displayName: string
  thumbnailUrl: string | null
  providerName?: string | null
  /** Optional badge text rendered top-left (e.g. "New", "Hot"). */
  badge?: string | null
}

interface GameTileProps {
  game: GameTileData
  /** Optional currency to pass through to the launch URL. */
  currency?: 'GC' | 'SC'
  className?: string
}

export function GameTile({ game, currency, className }: GameTileProps) {
  const router = useRouter()
  const href = `/casino-games/${game.slug}${currency ? `?currency=${currency}` : ''}`

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.button !== 0) return
      event.preventDefault()
      router.prefetch(href)
      haptic(hapticPatterns.tap)
      router.push(href)
    },
    [router, href],
  )

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex aspect-[333/470] flex-col items-center justify-center overflow-hidden rounded-md border-2 border-solid border-transparent transition-all duration-300 ease-in-out hover:-translate-y-1 hover:border-custom-yellow-1000 hover:shadow-game-card',
        className,
      )}
      aria-label={`Play ${game.displayName}`}
    >
      {game.thumbnailUrl ? (
        <Image
          src={game.thumbnailUrl}
          alt={game.displayName}
          fill
          sizes="(min-width: 1280px) 14vw, (min-width: 768px) 22vw, 50vw"
          className="bg-[#1a1a1a] object-cover transition-transform group-hover:scale-[1.04]"
          unoptimized
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[var(--cf-red-deep)] via-black to-[var(--cf-bg-card)] px-2 text-center">
          <span className="cf-headline cf-gold-text text-2xl">{game.displayName}</span>
        </div>
      )}

      {game.badge ? (
        <span className="absolute left-1.5 top-1.5 z-10 rounded-sm bg-[var(--cf-red-primary)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
          {game.badge}
        </span>
      ) : null}

      {/* {game.providerName ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-2.5 z-10 px-3 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {game.providerName}
        </span>
      ) : null} */}

      {game.id ? <FavoriteStarButton gameId={game.id} displayName={game.displayName} /> : null}
    </Link>
  )
}

function FavoriteStarButton({ gameId, displayName }: { gameId: string; displayName: string }) {
  const favorites = useFavoritesContext()
  const toast = useToast()
  const isFavorite = favorites.isFavorite(gameId)

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      haptic(hapticPatterns.tap)
      favorites.toggle(gameId, {
        onSuccess: (nextFavorite) => {
          if (nextFavorite) {
            toast.success(`${displayName} added to your favorites.`, {
              title: 'Added to Favorites',
              duration: 3000,
            })
          } else {
            toast.info(`${displayName} removed from your favorites.`, {
              title: 'Removed',
              duration: 2400,
            })
          }
        },
        onError: () => {
          toast.error("We couldn't save that - please try again.", {
            title: 'Favorite failed',
          })
        },
      })
    },
    [displayName, favorites, gameId, toast],
  )

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        isFavorite ? `Remove ${displayName} from favorites` : `Add ${displayName} to favorites`
      }
      aria-pressed={isFavorite}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'cf-tile-star absolute right-3 top-3 z-20 grid h-[26px] w-[26px] place-items-center',
        'focus-visible:outline-none',
      )}
    >
      <Star
        className={cn(
          'h-[26px] w-[26px] text-white transition-all duration-500 ease-[cubic-bezier(0.34_1.56_0.64_1)]',
          'origin-center scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100',
          'hover:scale-110 group-hover:text-white focus-visible:scale-110',
          isFavorite
            ? 'scale-100 fill-[var(--cf-gold-light)] opacity-100 text-[var(--cf-gold-light)]'
            : 'fill-transparent',
        )}
        strokeWidth={1.3}
        aria-hidden="true"
      />
    </button>
  )
}
