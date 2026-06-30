'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type PusherClient from 'pusher-js'

import type { SerializedWallet } from '@/lib/player-data'

// docs/10 §7 — real-time wiring for the player surface.
//
// Subscribes to private-player-{playerId} and binds:
//   - balance-update  → refetches wallets (today the server only sends
//                       { reason }; we treat any event as a "check
//                       balance now" signal) + diffs against the prior
//                       snapshot, then emits a typed `WalletEvent` for
//                       interested consumers (Big Win Reveal, balance
//                       count-up, etc).
//   - bonus-awarded   → invalidates queries + emits a `bonus` event
//   - kyc-update      → invalidates kyc query
//   - redemption-update → invalidates redemptions + wallets queries
//
// IMPORTANT: the chrome cares about DELTAS not absolute balances when
// celebrating. We keep a `lastWalletsRef` snapshot per-currency and
// diff against it whenever fresh wallets land. Anyone subscribing via
// `useWalletEvents()` gets the typed event with the per-currency delta.

export type RealtimeState = 'connected' | 'connecting' | 'disconnected'

export type WalletEventReason = 'win' | 'purchase' | 'bonus' | 'redemption' | 'refresh'

export interface WalletEvent {
  id: number
  reason: WalletEventReason
  gcDelta: bigint
  scDelta: bigint
  gcTotal: bigint
  scTotal: bigint
  receivedAt: number
}

type Handler = (event: WalletEvent) => void

interface RealtimeValue {
  state: RealtimeState
  wallets: SerializedWallet[]
  subscribe: (handler: Handler) => () => void
}

const noopUnsubscribe = () => {}

const RealtimeContext = React.createContext<RealtimeValue>({
  state: 'disconnected',
  wallets: [],
  subscribe: () => noopUnsubscribe,
})

export function usePlayerRealtime() {
  return React.useContext(RealtimeContext)
}

// Convenience hook for celebration / count-up listeners.
export function useWalletEvents(handler: Handler): void {
  const { subscribe } = usePlayerRealtime()
  const ref = React.useRef(handler)
  React.useEffect(() => {
    ref.current = handler
  }, [handler])
  React.useEffect(() => {
    return subscribe((event) => ref.current(event))
  }, [subscribe])
}

interface ProviderProps {
  playerId: string
  initialWallets: SerializedWallet[]
  children: React.ReactNode
}

function toBig(value: string | undefined): bigint {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

function pickByCurrency(
  wallets: SerializedWallet[],
  currency: 'GC' | 'SC',
): SerializedWallet | undefined {
  return wallets.find((w) => w.currency === currency)
}

export function PlayerRealtimeProvider({ playerId, initialWallets, children }: ProviderProps) {
  const [state, setState] = React.useState<RealtimeState>('connecting')
  const [wallets, setWallets] = React.useState<SerializedWallet[]>(initialWallets)
  const queryClient = useQueryClient()
  const lastWalletsRef = React.useRef<SerializedWallet[]>(initialWallets)
  const handlersRef = React.useRef<Set<Handler>>(new Set())
  const eventIdRef = React.useRef(0)

  const subscribe = React.useCallback((handler: Handler) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const emit = React.useCallback((reason: WalletEventReason, fresh: SerializedWallet[]) => {
    const priorGc = pickByCurrency(lastWalletsRef.current, 'GC')
    const priorSc = pickByCurrency(lastWalletsRef.current, 'SC')
    const freshGc = pickByCurrency(fresh, 'GC')
    const freshSc = pickByCurrency(fresh, 'SC')

    const event: WalletEvent = {
      id: ++eventIdRef.current,
      reason,
      gcTotal: toBig(freshGc?.totalBalance),
      scTotal: toBig(freshSc?.totalBalance),
      gcDelta: toBig(freshGc?.totalBalance) - toBig(priorGc?.totalBalance),
      scDelta: toBig(freshSc?.totalBalance) - toBig(priorSc?.totalBalance),
      receivedAt: Date.now(),
    }
    lastWalletsRef.current = fresh
    handlersRef.current.forEach((h) => {
      try {
        h(event)
      } catch (err) {
        console.error('[realtime] wallet-event handler threw', err)
      }
    })
  }, [])

  // docs/10 §7.4 — when the server layout re-renders (e.g. router.refresh
  // after the mock alea spin posts a wallet-changed message), we get new
  // initialWallets via props. Sync into local state so the balance bar
  // reflects the latest server-known balance immediately. Compares by
  // serialized snapshot to avoid render loops when nothing has actually
  // changed.
  const initialKey = React.useMemo(() => JSON.stringify(initialWallets), [initialWallets])
  React.useEffect(() => {
    setWallets(initialWallets)
    queryClient.setQueryData(['player', 'wallets'], initialWallets)
    // Don't emit on initial-prop sync — it's just a server-side render
    // landing; consumers should only react to wallet CHANGES at runtime.
    lastWalletsRef.current = initialWallets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  const refetchWallets = React.useCallback(
    async (reason: WalletEventReason) => {
      try {
        const res = await fetch('/api/player/wallets', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { wallets: SerializedWallet[] }
        if (!Array.isArray(json?.wallets)) return
        setWallets(json.wallets)
        queryClient.setQueryData(['player', 'wallets'], json.wallets)
        emit(reason, json.wallets)
      } catch (err) {
        console.warn('[realtime] wallet refetch failed', err)
      }
    },
    [emit, queryClient],
  )

  React.useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    if (!key || !cluster) {
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

      const channel = pusher.subscribe(`private-player-${playerId}`)
      channel.bind(
        'balance-update',
        (data: { wallets?: SerializedWallet[]; reason?: string } | undefined) => {
          const reason: WalletEventReason =
            data?.reason === 'win' ? 'win' : data?.reason === 'purchase' ? 'purchase' : 'refresh'
          if (Array.isArray(data?.wallets)) {
            setWallets(data.wallets)
            queryClient.setQueryData(['player', 'wallets'], data.wallets)
            emit(reason, data.wallets)
          } else {
            void refetchWallets(reason)
          }
        },
      )
      channel.bind('bonus-awarded', () => {
        void queryClient.invalidateQueries({ queryKey: ['player', 'bonuses'] })
        void queryClient.invalidateQueries({ queryKey: ['player', 'wallets'] })
        // The bonus-awarded publish payload carries the GC/SC amounts but
        // the *resulting wallet balances* still come from the ledger
        // commit, so we refetch to get authoritative totals and emit the
        // delta against the prior snapshot.
        void refetchWallets('bonus')
      })
      channel.bind('kyc-update', () => {
        void queryClient.invalidateQueries({ queryKey: ['player', 'kyc'] })
      })
      channel.bind('redemption-update', () => {
        void queryClient.invalidateQueries({ queryKey: ['player', 'redemptions'] })
        void queryClient.invalidateQueries({ queryKey: ['player', 'wallets'] })
        void refetchWallets('redemption')
      })
    })

    return () => {
      cancelled = true
      pusher?.disconnect()
    }
  }, [playerId, queryClient, emit, refetchWallets])

  const value = React.useMemo<RealtimeValue>(
    () => ({ state, wallets, subscribe }),
    [state, wallets, subscribe],
  )
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}
