'use client'

import * as React from 'react'

// Global context driving the Available Rewards popover. The topbar owns
// the popover itself (it needs the lightning-bolt button rect for
// anchoring), but other surfaces — the /promotions banner, deep-links
// like `?openRewards=1`, etc — can pull the popover open via this
// context. Keeps the provider tiny so the player chrome doesn't pay
// for a Pusher-style abstraction we don't need.

interface RewardsContextValue {
  open: boolean
  requestOpen: () => void
  setOpenInternal: (next: boolean) => void
}

const RewardsContext = React.createContext<RewardsContextValue | null>(null)

export function RewardsModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const value = React.useMemo<RewardsContextValue>(
    () => ({
      open,
      requestOpen: () => setOpen(true),
      setOpenInternal: (next) => setOpen(next),
    }),
    [open],
  )
  return <RewardsContext.Provider value={value}>{children}</RewardsContext.Provider>
}

export function useRewardsModal(): RewardsContextValue {
  const ctx = React.useContext(RewardsContext)
  if (!ctx) {
    // Provider is optional — the topbar mounts the popover on its own
    // when no provider is present. Surfaces that want to request opens
    // must mount the provider in the shell.
    return {
      open: false,
      requestOpen: () => {},
      setOpenInternal: () => {},
    }
  }
  return ctx
}
