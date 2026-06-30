'use client'

import * as React from 'react'

// docs/03 §8.5 — favorites context.
//
// The UI package stays dep-free of `@tanstack/react-query` so we expose
// a tiny context interface and let the host app fill it. `_shell.tsx`
// wires `useFavorites()` (apps/web/lib) → `<FavoritesProvider>` and
// every consumer in this package (GameTile, the immersive footer, the
// /favorites page if it ever client-renders) reads from this hook.
//
// When the context is absent (e.g. signed-out marketing page, story)
// the hook returns a no-op shape so tiles can still render an empty
// star outline without crashing.

export interface FavoritesContextValue {
  isFavorite: (gameId: string) => boolean
  toggle: (
    gameId: string,
    options?: {
      onSuccess?: (next: boolean) => void
      onError?: (error: Error) => void
    },
  ) => void
  isLoading: boolean
  isError: boolean
}

const NOOP_VALUE: FavoritesContextValue = {
  isFavorite: () => false,
  toggle: () => undefined,
  isLoading: false,
  isError: false,
}

const FavoritesContext = React.createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({
  value,
  children,
}: {
  value: FavoritesContextValue
  children: React.ReactNode
}) {
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavoritesContext(): FavoritesContextValue {
  const ctx = React.useContext(FavoritesContext)
  return ctx ?? NOOP_VALUE
}
