'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

export interface PackageFormValues {
  slug: string
  displayName: string
  priceUsd: number
  baseGc: number
  baseSc: number
  bonusGc: number
  bonusSc: number
  playthroughMultiplier: string
  bonusScPlaythroughMultiplier: string
  bonusGcPlaythroughMultiplier: string
  promotionalLabel: string
  badgeColor: string
  displayImageUrl: string
  description: string
  sortOrder: number
  featuredSlot: 1 | 2 | null
  bannerHeadline: string
  bannerSubhead: string
  bannerImageUrl: string
  status: 'active' | 'inactive' | 'archived'
  validFrom: string
  validUntil: string
  firstPurchaseOnly: boolean
  maxPerPlayer: number | ''
}

interface Props {
  mode: 'create' | 'edit'
  initial: PackageFormValues
  packageId?: string
}

const BADGE_COLORS: Array<{ value: string; label: string }> = [
  { value: '', label: 'No badge color' },
  { value: 'gold', label: 'Gold' },
  { value: 'red', label: 'Red' },
  { value: 'purple', label: 'Purple' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'silver', label: 'Silver' },
]

export function PackageForm({ mode, initial, packageId }: Props) {
  const router = useRouter()
  const [v, setV] = React.useState<PackageFormValues>(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // SC convenience hint — operator's existing Gamma model: total SC ⇒ 1000× GC.
  const totalSc = (Number(v.baseSc) || 0) + (Number(v.bonusSc) || 0)
  const totalGc = (Number(v.baseGc) || 0) + (Number(v.bonusGc) || 0)
  const gcMismatch = totalSc > 0 && totalGc !== totalSc * 1000

  function set<K extends keyof PackageFormValues>(key: K, value: PackageFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = {
        slug: v.slug,
        displayName: v.displayName,
        priceUsd: Number(v.priceUsd),
        baseGc: Number(v.baseGc),
        baseSc: Number(v.baseSc),
        bonusGc: Number(v.bonusGc),
        bonusSc: Number(v.bonusSc),
        playthroughMultiplier: v.playthroughMultiplier || '1.0',
        bonusScPlaythroughMultiplier: v.bonusScPlaythroughMultiplier || '3.0',
        bonusGcPlaythroughMultiplier: v.bonusGcPlaythroughMultiplier || '1.0',
        promotionalLabel: v.promotionalLabel || null,
        badgeColor: v.badgeColor || null,
        displayImageUrl: v.displayImageUrl || null,
        description: v.description || null,
        sortOrder: Number(v.sortOrder),
        featuredSlot: v.featuredSlot,
        bannerHeadline: v.bannerHeadline || null,
        bannerSubhead: v.bannerSubhead || null,
        bannerImageUrl: v.bannerImageUrl || null,
        status: v.status,
        validFrom: v.validFrom ? new Date(v.validFrom).toISOString() : null,
        validUntil: v.validUntil ? new Date(v.validUntil).toISOString() : null,
        firstPurchaseOnly: v.firstPurchaseOnly,
        maxPerPlayer: v.maxPerPlayer === '' ? null : Number(v.maxPerPlayer),
      }
      const url = mode === 'create' ? '/api/admin/packages' : `/api/admin/packages/${packageId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as {
        id?: string
        error?: string
        details?: unknown
      } | null
      if (!res.ok) {
        if (data?.error === 'slug_conflict') setError('That slug is already in use.')
        else if (data?.error === 'featured_slot_taken')
          setError('That featured slot is already taken. Clear the existing package first.')
        else setError(data?.error ?? 'Request failed.')
        return
      }
      router.push('/admin/packages')
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

      {/* ---- Basics ----------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Basics
          </h2>
          <Field label="Display name" required>
            <Input
              required
              maxLength={120}
              value={v.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              placeholder="Welcome $10 Bundle"
            />
          </Field>
          <Field label="Slug (lowercase, hyphens only)" required>
            <Input
              required
              pattern="[a-z0-9-]+"
              maxLength={64}
              value={v.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="welcome-10"
            />
          </Field>
          <Field label="Description (operator-facing notes)">
            <textarea
              value={v.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full rounded-md border border-line-default bg-surface px-3 py-2 text-sm text-ink-primary"
              rows={2}
              maxLength={2000}
            />
          </Field>
          <Field label="Player-facing image URL">
            <Input
              value={v.displayImageUrl}
              onChange={(e) => set('displayImageUrl', e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </CardContent>
      </Card>

      {/* ---- Pricing + coins ------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Pricing &amp; coins
          </h2>
          <p className="text-xs text-ink-tertiary">
            Operator convention: GC equivalent is <span className="font-mono">1000×</span> the total
            SC (so 30 SC ⇒ 30,000 GC).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Price (USD)" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={v.priceUsd}
                onChange={(e) => set('priceUsd', Number(e.target.value))}
              />
            </Field>
            <Field label="Sort order">
              <Input
                type="number"
                step="1"
                min="0"
                value={v.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value))}
              />
            </Field>
            <Field label="Status">
              <select
                value={v.status}
                onChange={(e) => set('status', e.target.value as PackageFormValues['status'])}
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive (hidden, not deleted)</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Base GC" required>
              <Input
                type="number"
                step="1"
                min="0"
                required
                value={v.baseGc}
                onChange={(e) => set('baseGc', Number(e.target.value))}
              />
            </Field>
            <Field label="Bonus GC">
              <Input
                type="number"
                step="1"
                min="0"
                value={v.bonusGc}
                onChange={(e) => set('bonusGc', Number(e.target.value))}
              />
            </Field>
            <Field label="Base SC" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={v.baseSc}
                onChange={(e) => set('baseSc', Number(e.target.value))}
              />
            </Field>
            <Field label="Bonus SC">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={v.bonusSc}
                onChange={(e) => set('bonusSc', Number(e.target.value))}
              />
            </Field>
          </div>
          {gcMismatch ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Heads-up: total GC ({totalGc.toLocaleString()}) isn&apos;t exactly 1000× total SC (
              {totalSc.toLocaleString()}). That breaks the operator&apos;s usual model — confirm
              this is intentional.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- Playthrough ----------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Playthrough
          </h2>
          <p className="text-xs text-ink-tertiary">
            Base SC clears at the first multiplier; the bonus SC has its own (typically higher)
            multiplier so welcome bundles can run base 1× / bonus 3× like the Gamma model.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Base SC playthrough (×)">
              <Input
                type="number"
                step="0.01"
                min="1"
                value={v.playthroughMultiplier}
                onChange={(e) => set('playthroughMultiplier', e.target.value)}
              />
            </Field>
            <Field label="Bonus SC playthrough (×)">
              <Input
                type="number"
                step="0.01"
                min="1"
                value={v.bonusScPlaythroughMultiplier}
                onChange={(e) => set('bonusScPlaythroughMultiplier', e.target.value)}
              />
            </Field>
            <Field label="Bonus GC playthrough (×)">
              <Input
                type="number"
                step="0.01"
                min="1"
                value={v.bonusGcPlaythroughMultiplier}
                onChange={(e) => set('bonusGcPlaythroughMultiplier', e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ---- Player visibility + targeting ----------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Visibility &amp; targeting
          </h2>
          <Field
            label={
              <>
                <input
                  type="checkbox"
                  checked={v.firstPurchaseOnly}
                  onChange={(e) => set('firstPurchaseOnly', e.target.checked)}
                  className="mr-2 align-middle"
                />
                Welcome package (only shown until the player makes their first paid purchase)
              </>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valid from (optional)">
              <Input
                type="datetime-local"
                value={v.validFrom}
                onChange={(e) => set('validFrom', e.target.value)}
              />
            </Field>
            <Field label="Valid until (optional)">
              <Input
                type="datetime-local"
                value={v.validUntil}
                onChange={(e) => set('validUntil', e.target.value)}
              />
            </Field>
            <Field label="Max per player (optional)">
              <Input
                type="number"
                step="1"
                min="1"
                value={v.maxPerPlayer === '' ? '' : v.maxPerPlayer}
                onChange={(e) =>
                  set('maxPerPlayer', e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ---- Promo banner + badge -------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Promo banner &amp; badge
          </h2>
          <p className="text-xs text-ink-tertiary">
            The promotional label shows on the package tile. Featured slots render the banner copy
            below at the top of the player shop modal.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Promotional label (small badge)">
              <Input
                maxLength={40}
                value={v.promotionalLabel}
                onChange={(e) => set('promotionalLabel', e.target.value)}
                placeholder="Best Value"
              />
            </Field>
            <Field label="Badge color">
              <select
                value={v.badgeColor}
                onChange={(e) => set('badgeColor', e.target.value)}
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                {BADGE_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Featured slot (top of player shop)">
              <select
                value={v.featuredSlot ?? ''}
                onChange={(e) =>
                  set(
                    'featuredSlot',
                    e.target.value === '' ? null : (Number(e.target.value) as 1 | 2),
                  )
                }
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="">Not featured</option>
                <option value="1">Slot 1 (left)</option>
                <option value="2">Slot 2 (right)</option>
              </select>
            </Field>
            <Field label="Banner image URL">
              <Input
                value={v.bannerImageUrl}
                onChange={(e) => set('bannerImageUrl', e.target.value)}
                placeholder="https://..."
              />
            </Field>
            <Field label="Banner headline">
              <Input
                maxLength={120}
                value={v.bannerHeadline}
                onChange={(e) => set('bannerHeadline', e.target.value)}
                placeholder="Limited time — 50% bonus SC"
              />
            </Field>
            <Field label="Banner sub-headline">
              <Input
                maxLength={200}
                value={v.bannerSubhead}
                onChange={(e) => set('bannerSubhead', e.target.value)}
                placeholder="Use code WEEKEND at checkout"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/packages">Cancel</Link>
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Create package' : 'Save changes'}
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

export const DEFAULT_FORM_VALUES: PackageFormValues = {
  slug: '',
  displayName: '',
  priceUsd: 10,
  baseGc: 10000,
  baseSc: 10,
  bonusGc: 0,
  bonusSc: 0,
  playthroughMultiplier: '1.0',
  bonusScPlaythroughMultiplier: '3.0',
  bonusGcPlaythroughMultiplier: '1.0',
  promotionalLabel: '',
  badgeColor: '',
  displayImageUrl: '',
  description: '',
  sortOrder: 100,
  featuredSlot: null,
  bannerHeadline: '',
  bannerSubhead: '',
  bannerImageUrl: '',
  status: 'active',
  validFrom: '',
  validUntil: '',
  firstPurchaseOnly: false,
  maxPerPlayer: '',
}
