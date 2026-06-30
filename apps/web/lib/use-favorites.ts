'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// docs/03 §8.5 — client-side favorites cache.
//
// Every `GameTile` (and the immersive game footer) calls `useFavorites()`
// to read the current set + get the `toggle()` mutation. TanStack Query
// dedups the GET so dozens of tiles share a single request, and the
// optimistic update keeps the click response feeling instant — the
// star fills *before* the server replies.
//
// Returns a plain Set<string> for O(1) membership checks at render time.

const FAVORITES_QUERY_KEY = ['player', 'favorites'] as const

interface FavoritesResponse {
  gameIds: string[]
}

interface TogglePayload {
  gameId: string
  favorite?: boolean
}

interface ToggleResponse {
  favorite: boolean
  count: number
}

async function fetchFavorites(): Promise<FavoritesResponse> {
  const res = await fetch('/api/player/favorites', { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 401) return { gameIds: [] }
    throw new Error(`favorites_fetch_failed_${res.status}`)
  }
  return (await res.json()) as FavoritesResponse
}

async function postFavorite(payload: TogglePayload): Promise<ToggleResponse> {
  const res = await fetch('/api/player/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `favorite_toggle_failed_${res.status}`)
  }
  return (await res.json()) as ToggleResponse
}

export interface UseFavoritesApi {
  /** Constant-time membership check for the rendered tile star. */
  isFavorite: (gameId: string) => boolean
  /** Full set — used by /favorites to render the grid. */
  ids: ReadonlySet<string>
  /** True until the first list returns. Tiles render an empty star meanwhile. */
  isLoading: boolean
  /** Did the GET fail (e.g. network)? Star stays interactive but read state is stale. */
  isError: boolean
  /**
   * Toggle the favorite state for a game. Optimistically updates the
   * cache so the star flips immediately, then reconciles with the
   * server response. On failure the optimistic write is rolled back
   * and `onError` is invoked so the caller can show a toast.
   */
  toggle: (
    gameId: string,
    options?: {
      onSuccess?: (next: boolean) => void
      onError?: (error: Error) => void
    },
  ) => void
}

export function useFavorites(): UseFavoritesApi {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: fetchFavorites,
    // Favorites change rarely once set. 5min stale lets dozens of tiles
    // share a single round-trip on a lobby render; the mutation below
    // hand-invalidates the cache so flips show up everywhere instantly.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const ids = React.useMemo(() => {
    return new Set(query.data?.gameIds ?? [])
  }, [query.data])

  const mutation = useMutation({
    mutationFn: postFavorite,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_QUERY_KEY })
      const previous = queryClient.getQueryData<FavoritesResponse>(FAVORITES_QUERY_KEY)
      const currentIds = new Set(previous?.gameIds ?? [])
      const isFavoriteNow = currentIds.has(variables.gameId)
      const nextFavorite = variables.favorite === undefined ? !isFavoriteNow : variables.favorite
      const nextIds = new Set(currentIds)
      if (nextFavorite) nextIds.add(variables.gameId)
      else nextIds.delete(variables.gameId)
      queryClient.setQueryData<FavoritesResponse>(FAVORITES_QUERY_KEY, {
        gameIds: Array.from(nextIds),
      })
      return { previous, nextFavorite }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FAVORITES_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY })
    },
  })

  const toggle = React.useCallback<UseFavoritesApi['toggle']>(
    (gameId, options) => {
      mutation.mutate(
        { gameId },
        {
          onSuccess: (data) => options?.onSuccess?.(data.favorite),
          onError: (error) =>
            options?.onError?.(error instanceof Error ? error : new Error(String(error))),
        },
      )
    },
    [mutation],
  )

  return {
    isFavorite: React.useCallback((gameId: string) => ids.has(gameId), [ids]),
    ids,
    isLoading: query.isLoading,
    isError: query.isError,
    toggle,
  }
}
