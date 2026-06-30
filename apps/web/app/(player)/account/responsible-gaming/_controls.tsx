'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

import { formatCoins } from '@/lib/format'
import { GoldButton } from '@coinfrenzy/ui/player'

// docs/09 §7 — deposit limits, session limits, self-exclusion.
//
// All three controls write through /api/player/rg/* endpoints which call
// `compliance.updateDepositLimit`, `compliance.updateSessionLimit`, and
// `compliance.selfExclude` from core.

interface RgState {
  status: string
  selfExcludedUntil: string | null
  depositLimitDaily: string | null
  depositLimitWeekly: string | null
  depositLimitMonthly: string | null
  sessionLimitMin: number | null
  pendingChanges: Array<{
    id: string
    limitKind: string
    nextValue: string
    applyAt: string
    requestedAt: string
  }>
}

interface RgControlsProps {
  initial: RgState
}

const SCALE = 10_000n

function toMinor(usd: string): bigint | null {
  if (!usd.trim()) return null
  const num = Number(usd)
  if (!isFinite(num) || num < 0) return null
  return BigInt(Math.round(num * Number(SCALE)))
}

function toMajorString(value: string | null): string {
  if (value === null) return ''
  return formatCoins(value)
}

export function RgControls({ initial }: RgControlsProps) {
  const router = useRouter()
  const [state, setState] = React.useState<RgState>(initial)
  const [excluded, setExcluded] = React.useState<boolean>(
    initial.status === 'self_excluded' &&
      (initial.selfExcludedUntil === null || new Date(initial.selfExcludedUntil) > new Date()),
  )

  return (
    <div className="space-y-6">
      <DepositLimits state={state} onChange={setState} />
      <SessionLimit state={state} onChange={setState} />
      <PendingChanges state={state} />
      <SelfExclusion
        excluded={excluded}
        onExcluded={(updated) => {
          setExcluded(true)
          setState((s) => ({ ...s, status: 'self_excluded', selfExcludedUntil: updated }))
          router.refresh()
        }}
      />
    </div>
  )
}

function DepositLimits({
  state,
  onChange,
}: {
  state: RgState
  onChange: React.Dispatch<React.SetStateAction<RgState>>
}) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Purchase limits</h3>
      <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
        Maximum amount you can purchase per period (in USD). Increases take 24 hours to take effect.
        Decreases are immediate.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DepositLimitField
          kind="deposit_daily"
          label="Daily limit"
          value={state.depositLimitDaily}
          onSaved={(v) => onChange((s) => ({ ...s, depositLimitDaily: v }))}
        />
        <DepositLimitField
          kind="deposit_weekly"
          label="Weekly limit"
          value={state.depositLimitWeekly}
          onSaved={(v) => onChange((s) => ({ ...s, depositLimitWeekly: v }))}
        />
        <DepositLimitField
          kind="deposit_monthly"
          label="Monthly limit"
          value={state.depositLimitMonthly}
          onSaved={(v) => onChange((s) => ({ ...s, depositLimitMonthly: v }))}
        />
      </div>
    </section>
  )
}

function DepositLimitField({
  kind,
  label,
  value,
  onSaved,
}: {
  kind: 'deposit_daily' | 'deposit_weekly' | 'deposit_monthly'
  label: string
  value: string | null
  onSaved: (next: string | null) => void
}) {
  const [draft, setDraft] = React.useState<string>(toMajorString(value))
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setError(null)
    setMessage(null)
    const nextValue = toMinor(draft)
    if (draft.trim() && nextValue === null) {
      setError('Enter a valid dollar amount')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/player/rg/deposit-limit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          nextValue: nextValue !== null ? nextValue.toString() : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not save')
        return
      }
      const body = (await res.json()) as { status: 'applied' | 'pending'; applyAt?: string | null }
      if (body.status === 'applied') {
        onSaved(nextValue !== null ? nextValue.toString() : null)
        setMessage('Saved')
      } else if (body.applyAt) {
        setMessage(`Pending: takes effect ${new Date(body.applyAt).toLocaleString()}`)
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`limit-${kind}`}>{label}</Label>
      <div className="flex gap-2">
        <span className="flex items-center px-2 text-sm text-muted-foreground">$</span>
        <Input
          id={`limit-${kind}`}
          inputMode="decimal"
          placeholder="No limit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="sm" type="button" onClick={save} disabled={busy}>
          {busy ? '…' : 'Save'}
        </Button>
      </div>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SessionLimit({
  state,
  onChange,
}: {
  state: RgState
  onChange: React.Dispatch<React.SetStateAction<RgState>>
}) {
  const [draft, setDraft] = React.useState<string>(
    state.sessionLimitMin !== null ? String(state.sessionLimitMin) : '',
  )
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setError(null)
    setMessage(null)
    const nextMinutes = draft.trim() ? Number(draft) : null
    if (nextMinutes !== null && (!Number.isFinite(nextMinutes) || nextMinutes < 1)) {
      setError('Enter a positive number of minutes')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/player/rg/session-limit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nextMinutes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not save')
        return
      }
      const body = (await res.json()) as { status: 'applied' | 'pending'; applyAt?: string | null }
      if (body.status === 'applied') {
        onChange((s) => ({ ...s, sessionLimitMin: nextMinutes }))
        setMessage('Saved')
      } else if (body.applyAt) {
        setMessage(`Pending: takes effect ${new Date(body.applyAt).toLocaleString()}`)
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-[var(--cf-border-default)]/60 pt-6">
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Session limit</h3>
      <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
        Maximum continuous play time. You&apos;ll be signed out automatically when reached.
      </p>
      <div className="mt-4 flex max-w-sm gap-2">
        <Input
          inputMode="numeric"
          placeholder="No limit (minutes)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="sm" type="button" onClick={save} disabled={busy}>
          {busy ? '…' : 'Save'}
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-success">{message}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  )
}

function PendingChanges({ state }: { state: RgState }) {
  if (state.pendingChanges.length === 0) return null
  return (
    <section className="rounded-md border border-[var(--cf-gold-medium)]/40 bg-[var(--cf-gold-medium)]/5 p-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--cf-gold-light)]">
        Pending changes
      </h3>
      <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
        Limit increases take 24 hours to take effect.
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {state.pendingChanges.map((c) => (
          <li key={c.id}>
            <span className="text-muted-foreground">{c.limitKind}</span> →{' '}
            <span className="font-mono" data-numeric="true">
              {c.nextValue === 'null' ? 'no limit' : c.nextValue}
            </span>{' '}
            <span className="text-muted-foreground">
              takes effect {new Date(c.applyAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type SelfExcludeDuration = '1d' | '7d' | '30d' | '6m' | '1y' | 'permanent'

const SELF_EXCLUDE_PERIODS: Array<{ id: SelfExcludeDuration; label: string }> = [
  { id: '1d', label: '24 Hours' },
  { id: '7d', label: '1 Week' },
  { id: '30d', label: '1 Month' },
  { id: '6m', label: '6 Month' },
  { id: '1y', label: '1 Year' },
  { id: 'permanent', label: 'Permanently' },
]

function SelfExclusion({
  excluded,
  onExcluded,
}: {
  excluded: boolean
  onExcluded: (until: string | null) => void
}) {
  const [duration, setDuration] = React.useState<SelfExcludeDuration>('30d')
  const [busy, setBusy] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  if (excluded) {
    return (
      <section className="rounded-md border border-[var(--cf-red-primary)]/40 bg-[var(--cf-red-primary)]/5 p-5">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--cf-red-primary)]">
          Self-excluded
        </h3>
        <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
          You are currently self-excluded. Per our policy you cannot shorten this period.
        </p>
      </section>
    )
  }

  async function commit() {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      // The API accepts the standard period strings; "6m" maps server-side
      // to a 180-day window. If the route hasn't been updated yet we
      // surface the error gracefully.
      const res = await fetch('/api/player/rg/self-exclude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ duration }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not apply self-exclusion')
        return
      }
      const body = (await res.json()) as { expiresAt: string | null; permanent: boolean }
      setSuccess(
        body.permanent
          ? 'You are now self-excluded permanently. Signing you out…'
          : `You are now self-excluded until ${
              body.expiresAt ? new Date(body.expiresAt).toLocaleString() : 'further notice'
            }. Signing you out…`,
      )
      onExcluded(body.expiresAt)
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 border-t border-[var(--cf-border-default)]/60 pt-6">
      <header>
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Self Exclusion</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--cf-gray-light)]">
          We are committed to providing you with a safe, enjoyable, and responsible gaming
          environment.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--cf-gray-light)]">
          To enhance your gaming experience you can choose to take a break or give yourself some
          time away from ensure a healthier gaming experience. Your break will start immediately
          once confirmed and it is non-reversible.
        </p>
      </header>

      <div role="radiogroup" aria-label="Self exclusion period" className="flex flex-wrap gap-2">
        {SELF_EXCLUDE_PERIODS.map((p) => {
          const active = p.id === duration
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setDuration(p.id)
                setConfirming(false)
              }}
              className={
                'h-10 rounded-md border px-4 text-sm font-semibold transition-all duration-200 ' +
                (active
                  ? 'cf-subnav-active text-white'
                  : 'border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-[var(--cf-gray-light)] hover:-translate-y-0.5 hover:border-[var(--cf-gold-medium)]/60 hover:text-white')
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="pt-2">
        {!confirming ? (
          <GoldButton
            type="button"
            variant="gold-horizontal"
            onClick={() => setConfirming(true)}
            className="cf-gold-gradient inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-extrabold uppercase tracking-[0.16em] text-[#1a1300] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-8px_rgba(245,208,102,0.55)]"
          >
            Self Exclude
          </GoldButton>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <GoldButton
              type="button"
              variant="gold-horizontal"
              onClick={commit}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--cf-red-primary)] px-5 text-sm font-extrabold uppercase tracking-[0.16em] text-white transition-all duration-200 hover:bg-[var(--cf-red-bright)] disabled:opacity-50"
            >
              {busy
                ? '...'
                : `Confirm: ${SELF_EXCLUDE_PERIODS.find((p) => p.id === duration)?.label ?? duration}`}
            </GoldButton>
            <GoldButton
              type="button"
              variant="gold-horizontal"
              onClick={() => setConfirming(false)}
              className="cf-gold-gradient inline-flex h-10 items-center justify-center rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-5 text-sm font-semibold text-white transition-colors hover:border-[var(--cf-gold-medium)]"
            >
              Cancel
            </GoldButton>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[var(--cf-red-primary)]">{error}</p>}
      {success && <p className="text-sm text-[var(--cf-green-bright)]">{success}</p>}
    </section>
  )
}
