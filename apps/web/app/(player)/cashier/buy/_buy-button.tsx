'use client'

import * as React from 'react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'

// docs/06 §13 — `purchase_promocode` trigger. The code (if any) is recorded
// on the purchase row at intent time; the Finix transfer.succeeded handler
// fires `redeemPromoCode` once payment clears.

const PROMO_STORAGE_KEY = 'cf:purchase_promo_code'

export function PromoCodeField() {
  const [code, setCode] = React.useState('')

  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(PROMO_STORAGE_KEY) ?? ''
      if (saved) setCode(saved)
    } catch {
      /* ignore */
    }
  }, [])

  function update(value: string) {
    setCode(value)
    try {
      if (value) window.sessionStorage.setItem(PROMO_STORAGE_KEY, value)
      else window.sessionStorage.removeItem(PROMO_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <label className="block text-xs font-medium text-muted-foreground">
        Have a promo code? (optional)
      </label>
      <div className="mt-1 flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => update(e.target.value.toUpperCase())}
          placeholder="WELCOME10"
          maxLength={64}
          className="font-mono uppercase"
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Applied at checkout. Awarded automatically once your purchase clears.
      </p>
    </div>
  )
}

export function BuyPackageButton({ packageId, label }: { packageId: string; label: string }) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function buy() {
    setLoading(true)
    setError(null)
    let promoCode: string | undefined
    try {
      promoCode = window.sessionStorage.getItem(PROMO_STORAGE_KEY) ?? undefined
      if (promoCode) promoCode = promoCode.trim() || undefined
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch('/api/player/purchase/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageId, promoCode }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Could not start purchase.')
        setLoading(false)
        return
      }
      const data = (await res.json()) as { url?: string; mode?: 'mock' | 'real' }
      if (!data.url) {
        setError('Checkout returned no URL — contact support.')
        setLoading(false)
        return
      }
      // mock mode → /mock-vendors/finix/checkout; real mode → /cashier/checkout.
      // Either way, the start endpoint owns the URL contract.
      window.location.href = data.url
    } catch {
      setError('Network error — please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={buy} disabled={loading}>
        {loading ? 'Opening…' : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
