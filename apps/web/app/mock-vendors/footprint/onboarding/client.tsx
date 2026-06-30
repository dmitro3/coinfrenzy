'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  fpId: string
  token: string
  email: string | null
  outcome: 'pass' | 'fail' | 'review'
  successUrl: string
  /** When true the page renders flush against a parent iframe and posts
   * `coinfrenzy:kyc-complete` outcome back via postMessage instead of
   * navigating away. */
  embedded?: boolean
  theme?: 'light' | 'dark'
}

const STEPS = ['Identity', 'Document', 'Selfie', 'Watchlist', 'Complete'] as const

export default function FootprintOnboardingClient({
  fpId,
  token,
  email,
  outcome,
  successUrl,
  embedded = false,
  theme = 'light',
}: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [fired, setFired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggered = useRef(false)

  useEffect(() => {
    if (stepIdx < STEPS.length - 1) {
      const id = setTimeout(() => setStepIdx((i) => i + 1), 250)
      return () => clearTimeout(id)
    }
    return
  }, [stepIdx])

  useEffect(() => {
    if (stepIdx === STEPS.length - 1 && !triggered.current) {
      triggered.current = true
      const id = setTimeout(async () => {
        try {
          const res = await fetch('/api/mock-vendors/footprint/fire-completion', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fpId, token, email, outcome }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error ?? `HTTP ${res.status}`)
          }
          setFired(true)
          setTimeout(() => {
            if (embedded && typeof window !== 'undefined' && window.parent !== window) {
              // Tell the parent shell the outcome and let it close the
              // modal + refresh. No full-page navigation in iframe mode.
              window.parent.postMessage(
                { type: 'coinfrenzy:kyc-complete', outcome },
                window.location.origin,
              )
            } else {
              window.location.href = successUrl
            }
          }, 750)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }, 1_000)
      return () => clearTimeout(id)
    }
    return
  }, [stepIdx, fpId, token, email, outcome, successUrl, embedded])

  const dark = theme === 'dark'
  const wrapperClass = dark ? 'space-y-5 bg-transparent p-4 text-white' : 'space-y-6'
  const cardClass = dark
    ? 'rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-lg backdrop-blur-sm'
    : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
  const bodyText = dark ? 'text-white/70' : 'text-slate-600'
  const headingText = dark ? 'text-white' : 'text-slate-900'
  const stepCurrentText = dark ? 'font-semibold text-white' : 'font-semibold text-slate-900'
  const stepDoneText = dark ? 'text-white/85' : 'text-slate-700'
  const stepIdleText = dark ? 'text-white/40' : 'text-slate-400'
  const stepIdleDot = dark ? 'bg-white/10 text-white/50' : 'bg-slate-200 text-slate-500'

  return (
    <div className={wrapperClass}>
      {!embedded && (
        <header className="space-y-1">
          <h1 className={`text-2xl font-semibold ${headingText}`}>Mock Footprint onboarding</h1>
          <p className={`text-sm ${bodyText}`}>
            This stand-in for the Footprint popover walks through KYC steps deterministically and
            fires the corresponding webhook back to our receiver.
          </p>
        </header>
      )}

      <section className={cardClass}>
        <ol className="space-y-3">
          {STEPS.map((label, idx) => {
            const isDone = idx < stepIdx
            const isCurrent = idx === stepIdx
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-amber-400 text-[#1a1300]'
                        : stepIdleDot
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </span>
                <span
                  className={`text-sm ${
                    isCurrent ? stepCurrentText : isDone ? stepDoneText : stepIdleText
                  }`}
                >
                  {label}
                  {isCurrent && idx < STEPS.length - 1 ? '…' : null}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className={`${cardClass} text-sm`}>
        <div className={`font-semibold ${dark ? 'text-white/85' : 'text-slate-700'}`}>
          Configured outcome
        </div>
        <div className={`mt-1 capitalize ${headingText}`}>{outcome}</div>
        {fired ? (
          <div
            className={`mt-3 rounded px-3 py-2 ${
              dark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-green-50 text-green-700'
            }`}
          >
            {embedded ? 'Verification complete. Closing…' : 'Webhook fired. Redirecting…'}
          </div>
        ) : null}
        {error ? (
          <div
            className={`mt-3 rounded px-3 py-2 ${
              dark ? 'bg-rose-500/15 text-rose-300' : 'bg-red-50 text-red-700'
            }`}
          >
            {error}
          </div>
        ) : null}
      </section>
    </div>
  )
}
