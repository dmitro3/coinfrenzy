'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, Maximize2, Minimize2, Star } from 'lucide-react'

import { useFavoritesContext, useToast } from '@coinfrenzy/ui/player'
import { cn } from '@coinfrenzy/ui'

// Bottom-edge game footer that ships in immersive mode (`/games/{id}`).
// Mirrors the live coinfrenzy.com game-play strip the founder shipped:
// game name on the left, action icons on the right. Stays our chrome —
// the provider iframe handles its own controls above.
//
// The Home icon backs out to the lobby, Fullscreen requests Fullscreen
// API on the page (escapes the chrome including the browser bar), and
// Favorite reads + writes through `useFavoritesContext()` so the
// starred state stays consistent with the lobby tile and survives
// route navigation (the cache is shared via TanStack Query in
// `_shell.tsx`'s `FavoritesHost`).

interface GameImmersiveFooterProps {
  gameId: string
  gameDisplayName: string
  currency: 'GC' | 'SC'
  sessionId: string
}

export function GameImmersiveFooter({
  gameId,
  gameDisplayName,
  currency,
  sessionId,
}: GameImmersiveFooterProps) {
  const toast = useToast()
  const router = useRouter()
  const favorites = useFavoritesContext()
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const isFavorited = favorites.isFavorite(gameId)

  // Track real browser fullscreen state so the icon flips correctly
  // when the player presses Esc to exit. Without this we'd be stuck
  // showing the "enter fullscreen" glyph after Esc.
  React.useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      toast.info('Your browser blocked the fullscreen request — try the F11 key instead.', {
        title: 'Fullscreen unavailable',
      })
    }
  }, [toast])

  const toggleFavorite = React.useCallback(() => {
    favorites.toggle(gameId, {
      onSuccess: (nextFavorite) => {
        if (nextFavorite) {
          toast.success(`${gameDisplayName} added to your favorites.`, {
            title: 'Added to Favorites',
            duration: 3000,
          })
        } else {
          toast.info(`${gameDisplayName} removed from your favorites.`, {
            title: 'Removed',
            duration: 2400,
          })
        }
      },
      onError: () => {
        toast.error('We couldn\u2019t save that — please try again.', {
          title: 'Favorite failed',
        })
      },
    })
  }, [favorites, gameDisplayName, gameId, toast])

  const onHome = React.useCallback(() => {
    router.push('/lobby')
  }, [router])

  return (
    <footer
      className="relative z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-t border-[var(--cf-border-default)] bg-gradient-to-b from-[#0d0d12] to-[#06060a] px-3 sm:h-14 sm:px-5"
      aria-label="Game controls"
    >
      {/* Tiny gold rule on the top edge mirrors the modal-frame style
          and visually separates the game iframe from our chrome. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--cf-gold-light)]/45 to-transparent"
      />

      <div className="flex min-w-0 items-center gap-3">
        <h2 className="cf-headline truncate text-sm font-bold uppercase tracking-[0.14em] text-white sm:text-base">
          {gameDisplayName}
        </h2>
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.18em] sm:inline-flex',
            currency === 'SC'
              ? 'border-[var(--cf-green-bright)]/55 bg-[#0a1a14] text-[var(--cf-green-bright)]'
              : 'border-[var(--cf-gold-medium)]/55 bg-[#1a1305] text-[var(--cf-gold-light)]',
          )}
          title={`Session ${sessionId}`}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              currency === 'SC' ? 'bg-[var(--cf-green-bright)]' : 'bg-[var(--cf-gold-light)]',
            )}
          />
          Playing {currency}
        </span>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <FooterIconLink href="/lobby" label="Lobby" onClick={onHome}>
          <Home className="h-4 w-4" />
        </FooterIconLink>
        <FooterIconButton
          label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </FooterIconButton>
        <FooterIconButton
          label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          onClick={toggleFavorite}
          pressed={isFavorited}
        >
          <Star
            className={cn(
              'h-4 w-4 transition-colors',
              isFavorited ? 'fill-[var(--cf-gold-light)] text-[var(--cf-gold-light)]' : '',
            )}
          />
        </FooterIconButton>
      </div>
    </footer>
  )
}

// Internal: identical visual treatment shared by the icon button + link
// variants so the row reads as one consistent control cluster.
const ICON_BTN_CLASSES = cn(
  'group inline-flex h-9 w-9 items-center justify-center rounded-md',
  'border border-transparent text-[var(--cf-gray-light)]',
  'transition-colors duration-150',
  'hover:border-[var(--cf-gold-medium)]/55 hover:bg-[var(--cf-bg-card-hover)] hover:text-[var(--cf-gold-light)]',
  'focus-visible:border-[var(--cf-gold-medium)] focus-visible:bg-[var(--cf-bg-card-hover)] focus-visible:text-[var(--cf-gold-light)] focus-visible:outline-none',
)

function FooterIconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        ICON_BTN_CLASSES,
        pressed && 'border-[var(--cf-gold-medium)]/55 text-[var(--cf-gold-light)]',
      )}
    >
      {children}
    </button>
  )
}

function FooterIconLink({
  href,
  label,
  onClick,
  children,
}: {
  href: string
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  // Renders as a Next Link so middle-click + cmd-click still open in
  // a new tab, but a primary-click handler is wired for the
  // immersive-exit confirmation pattern we may add later.
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={ICON_BTN_CLASSES}
    >
      {children}
    </Link>
  )
}
