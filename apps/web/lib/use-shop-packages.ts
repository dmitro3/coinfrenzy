'use client'

import { useQuery } from '@tanstack/react-query'

import type { ShopPackage, ShopPackagesData, ShopPackagesQuery } from '@coinfrenzy/ui/player'

// docs/10 §4.2 — TanStack Query wrapper around `/api/player/packages`.
//
// The shell calls this hook on mount so packages are warming in the
// background while the player looks at the lobby. By the time they
// click the SHOP button the cache is hot in ~95% of cases — the Shop
// modal renders straight to the package grid with no loader flicker.
//
// On cold-cache opens (network blip, immediately after sign-in) the
// modal renders our branded coin loader instead of grey skeletons.

const QUERY_KEY = ['player', 'shop-packages'] as const

interface RawPackagesResponse {
  packages: ShopPackage[]
  featured?: ShopPackage[]
  welcomeMode?: boolean
}

async function fetchShopPackages(): Promise<ShopPackagesData> {
  const res = await fetch('/api/player/packages', { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`packages_fetch_failed_${res.status}`)
  }
  const json = (await res.json()) as RawPackagesResponse
  return {
    packages: json.packages ?? [],
    featured: json.featured ?? [],
    welcomeMode: json.welcomeMode ?? false,
  }
}

/**
 * Read the packages query as the loader-friendly state machine the
 * Shop modal consumes. Multiple call sites can share the same cache
 * because TanStack Query dedups by `queryKey`.
 *
 * @returns A ShopPackagesQuery in one of three states:
 *   - `{ status: 'loading' }`
 *   - `{ status: 'ready', data }`
 *   - `{ status: 'error', refetch }`
 */
export function useShopPackages(): ShopPackagesQuery {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchShopPackages,
    // 5min stale — packages rarely change mid-session. The query
    // re-runs on window focus + reconnect per the global default in
    // `_providers.tsx`, so admin-side package updates still land
    // quickly without us hammering the endpoint.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  if (query.isError) {
    return {
      status: 'error',
      refetch: () => {
        void query.refetch()
      },
    }
  }
  if (query.data) {
    return { status: 'ready', data: query.data }
  }
  return { status: 'loading' }
}
