'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ShieldCheck } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

/**
 * Caps are loaded server-side from `system_config` and passed in as
 * serialisable numbers. The defaults below only apply when the parent
 * page forgets to thread them through (defensive).
 */
export interface TierCapsForUi {
  /** MAJOR SC. */
  weeklyScMax: number
  /** MAJOR SC. */
  monthlyScMax: number
  loginMultMax: number
  /** Decimal fraction, e.g. 0.25 = 25%. */
  cashbackPctMax: number
}

const FALLBACK_CAPS: TierCapsForUi = {
  weeklyScMax: 5_000,
  monthlyScMax: 25_000,
  loginMultMax: 3.0,
  cashbackPctMax: 0.25,
}

export interface TierFormValues {
  slug: string
  displayName: string
  level: number
  xpRequired: number
  weeklyScBonus: number
  monthlyScBonus: number
  dailyLoginBonusMult: string
  cashbackPctPercent: number
  iconUrl: string
  badgeColor: string
  description: string
  status: 'active' | 'inactive'
}

interface Props {
  mode: 'create' | 'edit'
  initial: TierFormValues
  tierId?: string
  caps?: TierCapsForUi
}

const BADGE_COLOR_OPTIONS = [
  { value: '', label: 'No badge color' },
  { value: '#9ca3af', label: 'Grey (Rookie)' },
  { value: '#a16207', label: 'Bronze' },
  { value: '#94a3b8', label: 'Silver' },
  { value: '#eab308', label: 'Gold' },
  { value: '#8b5cf6', label: 'Platinum (purple)' },
  { value: '#06b6d4', label: 'Diamond (cyan)' },
  { value: '#ef4444', label: 'Red' },
  { value: '#10b981', label: 'Green' },
]

export function TierForm({ mode, initial, tierId, caps = FALLBACK_CAPS }: Props) {
  const router = useRouter()
  const [v, setV] = React.useState<TierFormValues>(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const CAPS = caps

  function set<K extends keyof TierFormValues>(key: K, value: TierFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }))
  }

  // Live warnings — surface BEFORE the user clicks save so they can fix
  // typos without round-tripping to the API.
  const warnings = React.useMemo(() => {
    const ws: string[] = []
    if (v.weeklyScBonus > CAPS.weeklyScMax) {
      ws.push(`Weekly SC is above the safety cap of ${CAPS.weeklyScMax.toLocaleString()} SC.`)
    }
    if (v.monthlyScBonus > CAPS.monthlyScMax) {
      ws.push(`Monthly SC is above the safety cap of ${CAPS.monthlyScMax.toLocaleString()} SC.`)
    }
    const mult = Number.parseFloat(v.dailyLoginBonusMult)
    if (Number.isFinite(mult) && mult > CAPS.loginMultMax) {
      ws.push(
        `Login multiplier ${mult.toFixed(2)}× is above the safety cap of ${CAPS.loginMultMax.toFixed(1)}×.`,
      )
    }
    if (Number.isFinite(mult) && mult > 2.0) {
      ws.push(
        'Login multipliers above 2× incentivise log-in farming — keep an eye on retention abuse.',
      )
    }
    if (v.cashbackPctPercent > CAPS.cashbackPctMax * 100) {
      ws.push(
        `Cashback ${v.cashbackPctPercent.toFixed(2)}% is above the safety cap of ${(CAPS.cashbackPctMax * 100).toFixed(0)}%.`,
      )
    }
    if (v.cashbackPctPercent > 10) {
      ws.push(
        'Cashback above 10% rapidly erodes margin. Pair it with a wagering requirement before going live.',
      )
    }
    return ws
  }, [v, CAPS.cashbackPctMax, CAPS.loginMultMax, CAPS.monthlyScMax, CAPS.weeklyScMax])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = {
        slug: v.slug,
        displayName: v.displayName,
        level: Number(v.level),
        xpRequired: Number(v.xpRequired),
        weeklyScBonus: Number(v.weeklyScBonus),
        monthlyScBonus: Number(v.monthlyScBonus),
        dailyLoginBonusMult: v.dailyLoginBonusMult || '1.0',
        // DB stores cashback as a fraction (0.05 = 5%), the form takes a
        // percent — convert at the boundary.
        cashbackPct: (v.cashbackPctPercent / 100).toFixed(4),
        iconUrl: v.iconUrl || null,
        badgeColor: v.badgeColor || null,
        description: v.description || null,
        status: v.status,
      }
      const url = mode === 'create' ? '/api/admin/tiers' : `/api/admin/tiers/${tierId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as {
        id?: string
        error?: string
        details?: { field?: string; max?: string; reason?: string }
      } | null
      if (!res.ok) {
        if (data?.error === 'slug_conflict') setError('That slug is already in use.')
        else if (data?.error === 'level_conflict')
          setError(
            'That level is already taken — every tier needs a unique level. Pick a different number.',
          )
        else if (data?.error === 'tier_limit_reached')
          setError(
            'You already have the maximum number of tiers (20). Remove an unused tier first.',
          )
        else if (data?.error === 'cap_exceeded')
          setError(
            `Safety cap hit on ${data.details?.field ?? 'a field'} (max ${data.details?.max ?? 'see docs'}).`,
          )
        else if (data?.error === 'invalid')
          setError(`Invalid input: ${data.details?.reason ?? 'check the values'}.`)
        else setError(data?.error ?? 'Request failed.')
        return
      }
      router.push('/admin/tiers')
      router.refresh()
    } catch {
      setError('Connection problem. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? (
        <div className="rounded-md border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
          {error}
        </div>
      ) : null}

      {/* Safety hints */}
      <div className="rounded-md border border-line-subtle bg-surface/40 p-4 text-xs text-ink-secondary">
        <div className="flex items-center gap-2 text-ink-primary">
          <ShieldCheck className="h-4 w-4 text-positive" />
          <span className="font-semibold uppercase tracking-wide">Safety caps</span>
        </div>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li>Weekly SC: max {CAPS.weeklyScMax.toLocaleString()} SC per tier</li>
          <li>Monthly SC: max {CAPS.monthlyScMax.toLocaleString()} SC per tier</li>
          <li>Login multiplier: max {CAPS.loginMultMax.toFixed(1)}×</li>
          <li>Cashback: max {(CAPS.cashbackPctMax * 100).toFixed(0)}%</li>
        </ul>
        <p className="mt-2 text-ink-tertiary">
          Caps protect you from typos. Edit them at{' '}
          <Link href="/admin/settings/safety-caps" className="font-medium underline">
            /admin/settings/safety-caps
          </Link>{' '}
          (master role).
        </p>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Heads-up
          </div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Basics */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Basics
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Display name" required>
              <Input
                required
                maxLength={60}
                value={v.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                placeholder="Gold"
              />
            </Field>
            <Field label="Slug (lowercase, hyphens only)" required>
              <Input
                required
                pattern="[a-z0-9-]+"
                maxLength={40}
                value={v.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="gold"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Level (1–99)" required>
              <Input
                type="number"
                step="1"
                min="1"
                max="99"
                required
                value={v.level}
                onChange={(e) => set('level', Number(e.target.value))}
              />
            </Field>
            <Field label="XP required to reach this tier">
              <Input
                type="number"
                step="1"
                min="0"
                value={v.xpRequired}
                onChange={(e) => set('xpRequired', Number(e.target.value))}
              />
            </Field>
            <Field label="Status">
              <select
                value={v.status}
                onChange={(e) => set('status', e.target.value as TierFormValues['status'])}
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive (hidden)</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={v.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full rounded-md border border-line-default bg-surface px-3 py-2 text-sm text-ink-primary"
              rows={2}
              maxLength={500}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Badge color">
              <select
                value={v.badgeColor}
                onChange={(e) => set('badgeColor', e.target.value)}
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                {BADGE_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Custom badge color (hex, optional)">
              <Input
                value={v.badgeColor}
                onChange={(e) => set('badgeColor', e.target.value)}
                placeholder="#eab308"
              />
            </Field>
          </div>
          <Field label="Icon URL (optional)">
            <Input
              value={v.iconUrl}
              onChange={(e) => set('iconUrl', e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </CardContent>
      </Card>

      {/* Rewards */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Rewards
          </h2>
          <p className="text-xs text-ink-tertiary">
            These are what the player gets for being in this tier. Pair big SC rewards with a
            playthrough requirement in the bonus engine to control burn rate.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`Weekly SC bonus (max ${CAPS.weeklyScMax.toLocaleString()})`}>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={CAPS.weeklyScMax}
                value={v.weeklyScBonus}
                onChange={(e) => set('weeklyScBonus', Number(e.target.value))}
              />
            </Field>
            <Field label={`Monthly SC bonus (max ${CAPS.monthlyScMax.toLocaleString()})`}>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={CAPS.monthlyScMax}
                value={v.monthlyScBonus}
                onChange={(e) => set('monthlyScBonus', Number(e.target.value))}
              />
            </Field>
            <Field label={`Daily-login multiplier (1.0–${CAPS.loginMultMax.toFixed(1)}×)`}>
              <Input
                type="number"
                step="0.01"
                min="1"
                max={CAPS.loginMultMax}
                value={v.dailyLoginBonusMult}
                onChange={(e) => set('dailyLoginBonusMult', e.target.value)}
              />
            </Field>
            <Field
              label={`Cashback % (0–${(CAPS.cashbackPctMax * 100).toFixed(0)}%, of net losses)`}
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                max={CAPS.cashbackPctMax * 100}
                value={v.cashbackPctPercent}
                onChange={(e) => set('cashbackPctPercent', Number(e.target.value))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/tiers">Cancel</Link>
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Create tier' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: React.ReactNode
  required?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-ink-secondary">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </Label>
      {children}
    </div>
  )
}

export const DEFAULT_TIER_VALUES: TierFormValues = {
  slug: '',
  displayName: '',
  level: 1,
  xpRequired: 0,
  weeklyScBonus: 0,
  monthlyScBonus: 0,
  dailyLoginBonusMult: '1.0',
  cashbackPctPercent: 0,
  iconUrl: '',
  badgeColor: '',
  description: '',
  status: 'active',
}
