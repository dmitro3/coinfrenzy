'use client'

import * as React from 'react'

// React context for the Shop modal. Any descendant component (the
// top-bar SHOP button, the sidebar SHOP link, the lobby promos) can
// trigger the modal via the `useShopModal()` hook. The actual modal
// renders once at the shell root via `<ShopModalRoot />`, so opening
// from anywhere shows the same instance.

export type ShopTab = 'buy' | 'redeem'

interface ShopModalContextValue {
  open: boolean
  tab: ShopTab
  openShop: (tab?: ShopTab) => void
  close: () => void
  setTab: (tab: ShopTab) => void
  /**
   * "Immersive" mode — when true, the modal hides its tab strip so a
   * focused view (the embedded Finix checkout, the payment-declined
   * recovery card, or the post-purchase celebration with the fox
   * cameo) gets the full body without the Buy/Redeem switcher
   * fighting for attention.
   */
  immersive: boolean
  setImmersive: (next: boolean) => void
}

const ShopModalContext = React.createContext<ShopModalContextValue | null>(null)

export function ShopModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<ShopTab>('buy')
  const [immersive, setImmersive] = React.useState(false)

  const openShop = React.useCallback((next: ShopTab = 'buy') => {
    setTab(next)
    setImmersive(false)
    setOpen(true)
  }, [])
  const close = React.useCallback(() => {
    setOpen(false)
    setImmersive(false)
  }, [])

  const value = React.useMemo<ShopModalContextValue>(
    () => ({ open, tab, openShop, close, setTab, immersive, setImmersive }),
    [open, tab, openShop, close, immersive],
  )

  return <ShopModalContext.Provider value={value}>{children}</ShopModalContext.Provider>
}

export function useShopModal(): ShopModalContextValue {
  const ctx = React.useContext(ShopModalContext)
  if (!ctx) {
    // Components used outside the provider get a no-op so the SHOP
    // button still functions as a link fallback (e.g. on marketing
    // surfaces) without throwing.
    return {
      open: false,
      tab: 'buy',
      openShop: () => {
        if (typeof window !== 'undefined') window.location.href = '/shop'
      },
      close: () => undefined,
      setTab: () => undefined,
      immersive: false,
      setImmersive: () => undefined,
    }
  }
  return ctx
}
