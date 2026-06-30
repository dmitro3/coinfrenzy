'use client'

import * as React from 'react'
import type PusherClient from 'pusher-js'

export type RealtimeState = 'connected' | 'connecting' | 'disconnected'

// docs/12 §9 + the core/reports helper. Money values arrive as bigint-strings
// (decimal-aware, minor units) so we can format losslessly client-side.
//
// Fields added after initial launch are optional on the wire so an older
// worker build deploying mid-flight doesn't tear down the dashboard for
// connected admins. The provider hydrates safe defaults before re-exposing.
export interface DashboardCountersPayload {
  updatedAt: string
  scStakedToday: string
  scWonToday: string
  ggrToday: string
  ngrToday: string
  scAwardedToday: string
  netScPosition: string
  depositsToday: string
  pendingRedemptionsUsd: string
  completedRedemptionsUsd: string
  netCashToday: string
  pendingRedemptionsCount: number
  completedRedemptionsCount: number
  purchaseCountToday: number
  purchasingPlayersToday: number
  holdBpsToday: number
  onlinePlayers: number
  dauToday: number
  signupsToday: number
  firstPurchasersToday: number
  weeklyActive: number
  uniqueLoginsToday: number
  totalPlayersAllTime: number
  totalPurchasersAllTime: number
}

// What a wire payload may actually contain — fields added later are tolerated
// as missing so we can decode forward-compat or back-compat without crashing.
type RawCountersPayload = Partial<DashboardCountersPayload> &
  Pick<DashboardCountersPayload, 'updatedAt'>

function hydrateCounters(raw: RawCountersPayload): DashboardCountersPayload {
  return {
    updatedAt: raw.updatedAt,
    scStakedToday: raw.scStakedToday ?? '0',
    scWonToday: raw.scWonToday ?? '0',
    ggrToday: raw.ggrToday ?? '0',
    ngrToday: raw.ngrToday ?? '0',
    scAwardedToday: raw.scAwardedToday ?? '0',
    netScPosition: raw.netScPosition ?? '0',
    depositsToday: raw.depositsToday ?? '0',
    pendingRedemptionsUsd: raw.pendingRedemptionsUsd ?? '0',
    completedRedemptionsUsd: raw.completedRedemptionsUsd ?? '0',
    netCashToday: raw.netCashToday ?? '0',
    pendingRedemptionsCount: raw.pendingRedemptionsCount ?? 0,
    completedRedemptionsCount: raw.completedRedemptionsCount ?? 0,
    purchaseCountToday: raw.purchaseCountToday ?? 0,
    purchasingPlayersToday: raw.purchasingPlayersToday ?? 0,
    holdBpsToday: raw.holdBpsToday ?? -1,
    onlinePlayers: raw.onlinePlayers ?? 0,
    dauToday: raw.dauToday ?? 0,
    signupsToday: raw.signupsToday ?? 0,
    firstPurchasersToday: raw.firstPurchasersToday ?? 0,
    weeklyActive: raw.weeklyActive ?? 0,
    uniqueLoginsToday: raw.uniqueLoginsToday ?? 0,
    totalPlayersAllTime: raw.totalPlayersAllTime ?? 0,
    totalPurchasersAllTime: raw.totalPurchasersAllTime ?? 0,
  }
}

interface RealtimeContextValue {
  state: RealtimeState
  counters: DashboardCountersPayload | null
}

const RealtimeContext = React.createContext<RealtimeContextValue>({
  state: 'connecting',
  counters: null,
})

export function useRealtime(): RealtimeContextValue {
  return React.useContext(RealtimeContext)
}

export function RealtimeProvider({
  adminId: _adminId,
  children,
}: {
  adminId: string
  children: React.ReactNode
}) {
  const [state, setState] = React.useState<RealtimeState>('connecting')
  const [counters, setCounters] = React.useState<DashboardCountersPayload | null>(null)

  React.useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    if (!key || !cluster) {
      // Real-time is a progressive enhancement (docs/10 §7.4) — the rest of
      // the app must still work without it.
      setState('disconnected')
      return
    }

    let pusher: PusherClient | null = null
    let cancelled = false
    void import('pusher-js').then(({ default: Pusher }) => {
      if (cancelled) return
      pusher = new Pusher(key, {
        cluster,
        forceTLS: true,
        authEndpoint: '/api/realtime/auth',
        authTransport: 'ajax',
      })

      pusher.connection.bind('connected', () => setState('connected'))
      pusher.connection.bind('connecting', () => setState('connecting'))
      pusher.connection.bind('disconnected', () => setState('disconnected'))
      pusher.connection.bind('unavailable', () => setState('disconnected'))
      pusher.connection.bind('failed', () => setState('disconnected'))

      const channel = pusher.subscribe('admin-dashboard-counters')
      channel.bind('counters', (data: RawCountersPayload) => {
        setCounters(hydrateCounters(data))
      })
    })

    return () => {
      cancelled = true
      pusher?.disconnect()
    }
  }, [])

  const value = React.useMemo(() => ({ state, counters }), [state, counters])
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}
