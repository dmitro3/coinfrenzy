'use client'

import { useEffect, useState } from 'react'

interface Props {
  transferId: string
  purchaseId: string
  amount: number
  currency: string
  packageName: string
  successUrl: string
  cancelUrl: string
  /** When true, posts messages to window.parent instead of doing a full-page redirect — used by the inline Shop modal iframe. */
  embedded?: boolean
  /** Visual theme — 'dark' matches the Shop modal aesthetic when embedded. */
  theme?: 'light' | 'dark'
}

type Outcome = 'succeeded' | 'failed' | 'disputed'

export default function FinixCheckoutClient({
  transferId,
  purchaseId,
  amount,
  currency,
  packageName,
  successUrl,
  cancelUrl,
  embedded = false,
  theme = 'light',
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('succeeded')

  // When embedded, lock the page body's background so the iframe inherits
  // the parent's dark surface — no flash of white.
  useEffect(() => {
    if (!embedded) return
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [embedded])

  const handleConfirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/mock-vendors/finix/fire-transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transferId, purchaseId, outcome }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      if (embedded) {
        // Inline Shop modal — let the parent close us. We also fire
        // the wallet-changed message so the player shell refreshes
        // wallets in-place.
        window.parent.postMessage({ type: 'coinfrenzy:mock-finix-complete', outcome }, '*')
        window.parent.postMessage({ type: 'coinfrenzy:wallet-changed' }, '*')
      } else {
        window.location.href = outcome === 'succeeded' ? successUrl : cancelUrl
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (embedded) {
      window.parent.postMessage({ type: 'coinfrenzy:mock-finix-cancel' }, '*')
    } else {
      window.location.href = cancelUrl
    }
  }

  const dark = theme === 'dark' || embedded

  return (
    <div
      className={dark ? 'cf-finix cf-finix--dark space-y-4' : 'space-y-6'}
      data-theme={dark ? 'dark' : 'light'}
    >
      {!embedded && (
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Mock Finix Hosted Fields</h1>
          <p className="text-sm text-slate-600">
            This screen replaces the real Finix-hosted checkout iframe. The form fields below are
            visual only; nothing is submitted to Finix.
          </p>
        </header>
      )}

      <section
        className={
          dark ? 'cf-finix__panel' : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
        }
      >
        {!embedded && (
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Purchasing</div>
              <div className="text-lg font-medium">{packageName}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Total</div>
              <div className="text-lg font-semibold">
                {(amount / 100).toFixed(2)} {currency}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label
              className={
                dark ? 'cf-finix__label' : 'block text-xs font-medium uppercase text-slate-500'
              }
            >
              Card number
            </label>
            <input
              className={
                dark ? 'cf-finix__input' : 'mt-1 w-full rounded border border-slate-200 px-3 py-2'
              }
              placeholder="4242 4242 4242 4242"
              disabled
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                className={
                  dark ? 'cf-finix__label' : 'block text-xs font-medium uppercase text-slate-500'
                }
              >
                Expiry
              </label>
              <input
                className={
                  dark ? 'cf-finix__input' : 'mt-1 w-full rounded border border-slate-200 px-3 py-2'
                }
                placeholder="12/28"
                disabled
              />
            </div>
            <div>
              <label
                className={
                  dark ? 'cf-finix__label' : 'block text-xs font-medium uppercase text-slate-500'
                }
              >
                CVV
              </label>
              <input
                className={
                  dark ? 'cf-finix__input' : 'mt-1 w-full rounded border border-slate-200 px-3 py-2'
                }
                placeholder="123"
                disabled
              />
            </div>
            <div>
              <label
                className={
                  dark ? 'cf-finix__label' : 'block text-xs font-medium uppercase text-slate-500'
                }
              >
                ZIP
              </label>
              <input
                className={
                  dark ? 'cf-finix__input' : 'mt-1 w-full rounded border border-slate-200 px-3 py-2'
                }
                placeholder="10001"
                disabled
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className={
          dark ? 'cf-finix__panel' : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
        }
      >
        <h2
          className={
            dark ? 'cf-finix__section-title' : 'text-sm font-semibold uppercase text-slate-500'
          }
        >
          Simulated outcome
        </h2>
        {!embedded && (
          <p className="text-sm text-slate-600">
            Pick how the mock Finix backend should respond — this controls the webhook payload fired
            at our receiver.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['succeeded', 'failed', 'disputed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOutcome(value)}
              className={
                dark
                  ? `cf-finix__outcome ${outcome === value ? 'cf-finix__outcome--active' : ''}`
                  : `rounded border px-3 py-2 text-sm capitalize ${
                      outcome === value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`
              }
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div
          className={
            dark
              ? 'cf-finix__error'
              : 'rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
          }
        >
          {error}
        </div>
      ) : null}

      <div className="flex justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleCancel}
          className={
            dark
              ? 'cf-finix__btn cf-finix__btn--ghost'
              : 'rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
          }
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={
            dark
              ? 'cf-finix__btn cf-finix__btn--gold'
              : 'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
          }
        >
          {submitting ? 'Processing…' : `Pay ${(amount / 100).toFixed(2)} ${currency}`}
        </button>
      </div>
    </div>
  )
}
