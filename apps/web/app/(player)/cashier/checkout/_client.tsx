'use client'

import * as React from 'react'

import { Button } from '@coinfrenzy/ui/primitives/button'

// docs/05 §3 — Finix Hosted Fields integration.
//
// We load the official Finix JS script tag (https://docs.finix.com/docs/hosted-fields-v2)
// and mount three iframes (card number, expiry, CVV). On submit, the
// Finix form returns a `payment_instrument_id` we POST to our
// /api/player/purchase/confirm endpoint, which calls Finix server-side
// to create the actual transfer.
//
// The real Hosted Fields global is `Finix` on `window`. We type-assert
// minimally — the script is opaque to us beyond `form()` and `submit()`.

interface FinixForm {
  submit: (
    environment: 'sandbox' | 'live',
    applicationId: string,
    callback: (err: unknown, res?: { data?: { id?: string } }) => void,
  ) => void
}

interface FinixGlobal {
  Auth: (env: 'sandbox' | 'live', applicationId: string, sessionKey?: string) => unknown
  CardTokenForm: (containerId: string, options: Record<string, unknown>) => FinixForm
}

declare global {
  interface Window {
    Finix?: FinixGlobal
  }
}

interface Props {
  purchaseId: string
  intentId: string
  amountCents: number
  packageName: string
  finixApplicationId: string
  finixEnvironment: 'sandbox' | 'live'
  successUrl: string
  cancelUrl: string
}

const FINIX_SCRIPT_URL = 'https://js.finix.com/v/1/finix.js'

export function FinixCheckoutClient(props: Props) {
  const containerId = React.useId().replace(/:/g, '')
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'submitting' | 'error'>(
    'loading',
  )
  const [error, setError] = React.useState<string | null>(null)
  const formRef = React.useRef<FinixForm | null>(null)

  // Inject the Finix script once. We don't tear it down on unmount —
  // letting the browser cache it across navigations.
  React.useEffect(() => {
    let cancelled = false
    function mountForm() {
      if (cancelled) return
      if (!window.Finix) {
        setStatus('error')
        setError('Finix script failed to load.')
        return
      }
      try {
        const form = window.Finix.CardTokenForm(containerId, {
          showAddress: true,
          showLabels: true,
          labels: {
            name: 'Cardholder name',
            address_line1: 'Street address',
            address_city: 'City',
            address_region: 'State',
            address_postal_code: 'ZIP',
          },
          showPlaceholders: true,
          hideFields: ['address_line2', 'address_country'],
          requiredFields: ['name', 'address_postal_code'],
          styles: {
            default: {
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '6px',
              padding: '10px 12px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '14px',
              background: 'rgba(255,255,255,0.04)',
            },
            success: { color: '#fff' },
            error: { color: '#fca5a5', border: '1px solid #fca5a5' },
          },
        })
        formRef.current = form
        setStatus('ready')
      } catch (e) {
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Failed to mount Finix form.')
      }
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FINIX_SCRIPT_URL}"]`)
    if (existing) {
      if (window.Finix) mountForm()
      else existing.addEventListener('load', mountForm, { once: true })
      return () => {
        cancelled = true
      }
    }
    const script = document.createElement('script')
    script.src = FINIX_SCRIPT_URL
    script.async = true
    script.onload = mountForm
    script.onerror = () => {
      setStatus('error')
      setError('Could not reach Finix. Check your network and retry.')
    }
    document.head.appendChild(script)
    return () => {
      cancelled = true
    }
  }, [containerId])

  async function handleSubmit() {
    if (!formRef.current) return
    setStatus('submitting')
    setError(null)
    formRef.current.submit(props.finixEnvironment, props.finixApplicationId, async (err, res) => {
      if (err) {
        setStatus('ready')
        setError(err instanceof Error ? err.message : 'Card validation failed.')
        return
      }
      const tokenId = res?.data?.id
      if (!tokenId) {
        setStatus('ready')
        setError('Finix did not return a payment instrument id.')
        return
      }
      try {
        const confirm = await fetch('/api/player/purchase/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            purchaseId: props.purchaseId,
            paymentInstrumentId: tokenId,
          }),
        })
        if (!confirm.ok) {
          const body = (await confirm.json().catch(() => ({}))) as {
            error?: string
            detail?: string
          }
          setStatus('ready')
          setError(body.detail ?? body.error ?? 'Could not confirm purchase.')
          return
        }
        const body = (await confirm.json()) as { successUrl?: string }
        window.location.href = body.successUrl ?? props.successUrl
      } catch {
        setStatus('ready')
        setError('Network error confirming purchase.')
      }
    })
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Package</span>
          <span className="font-medium">{props.packageName}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold">${(props.amountCents / 100).toFixed(2)} USD</span>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div id={containerId} className="finix-hosted-fields" />
        {status === 'loading' && (
          <p className="mt-2 text-xs text-muted-foreground">Loading secure card form…</p>
        )}
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-between gap-3">
        <a
          href={props.cancelUrl}
          className="rounded border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/30"
        >
          Cancel
        </a>
        <Button onClick={handleSubmit} disabled={status !== 'ready'}>
          {status === 'submitting' ? 'Processing…' : `Pay $${(props.amountCents / 100).toFixed(2)}`}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Your purchase reference is{' '}
        <span className="font-mono">{props.intentId || props.purchaseId}</span>. Funds usually post
        within a few seconds. We&apos;ll email you a receipt.
      </p>
    </div>
  )
}
