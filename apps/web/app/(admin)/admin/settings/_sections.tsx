'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Edit3, Lock, Save, X } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

// Shared rendering primitives for the read-only field list.

export function FieldList({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-2 text-sm">{children}</dl>
}

export function FieldRow({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-subtle py-2 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</dt>
      <dd className="text-right">
        <div className="font-mono text-sm text-ink-primary">{value}</div>
        {hint ? <div className="text-xs text-ink-tertiary">{hint}</div> : null}
      </dd>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Section shell: Edit button + form + Save / Cancel
// ----------------------------------------------------------------------------

interface EditableSectionProps {
  canEdit: boolean
  /** Master-only label override (defaults to "manager+ to edit"). */
  permissionLabel?: string
  readView: React.ReactNode
  editView: (helpers: { busy: boolean }) => React.ReactNode
  /** Caller-controlled save. Resolve to null on success or string on error. */
  onSave: () => Promise<string | null>
  dirty: boolean
}

function EditableSection({
  canEdit,
  permissionLabel,
  readView,
  editView,
  onSave,
  dirty,
}: EditableSectionProps) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    const result = await onSave()
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <>
        {readView}
        <div className="flex items-center justify-end border-t border-line-subtle pt-3">
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="h-8"
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-tertiary">
              <Lock className="h-3 w-3" />
              {permissionLabel ?? 'manager+ to edit'}
            </span>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {editView({ busy })}
      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
      <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="h-8"
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={busy || !dirty} className="h-8">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// General settings
// ----------------------------------------------------------------------------

export interface GeneralValues {
  platformName: string
  supportEmail: string
  supportHours: string
  socialTwitter: string | null
  socialInstagram: string | null
  socialFacebook: string | null
}

export function GeneralSectionEditor({
  initial,
  canEdit,
}: {
  initial: GeneralValues
  canEdit: boolean
}) {
  const [v, setV] = React.useState<GeneralValues>(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  async function save(): Promise<string | null> {
    const res = await fetch('/api/admin/settings/general', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) return data?.error ?? `save failed (${res.status})`
    return null
  }

  return (
    <EditableSection
      canEdit={canEdit}
      readView={
        <FieldList>
          <FieldRow label="Platform name" value={initial.platformName} />
          <FieldRow label="Support email" value={initial.supportEmail} />
          <FieldRow label="Support hours" value={initial.supportHours} />
          <FieldRow label="Twitter / X" value={initial.socialTwitter ?? '—'} />
          <FieldRow label="Instagram" value={initial.socialInstagram ?? '—'} />
          <FieldRow label="Facebook" value={initial.socialFacebook ?? '—'} />
        </FieldList>
      }
      editView={({ busy }) => (
        <div className="grid grid-cols-1 gap-3">
          <TextField
            label="Platform name"
            value={v.platformName}
            onChange={(s) => setV((p) => ({ ...p, platformName: s }))}
            disabled={busy}
          />
          <TextField
            label="Support email"
            type="email"
            value={v.supportEmail}
            onChange={(s) => setV((p) => ({ ...p, supportEmail: s }))}
            disabled={busy}
          />
          <TextField
            label="Support hours"
            placeholder="e.g. 24/7 or M–F 9–5 ET"
            value={v.supportHours}
            onChange={(s) => setV((p) => ({ ...p, supportHours: s }))}
            disabled={busy}
          />
          <TextField
            label="Twitter / X handle"
            placeholder="@coinfrenzy"
            value={v.socialTwitter ?? ''}
            onChange={(s) => setV((p) => ({ ...p, socialTwitter: s }))}
            disabled={busy}
          />
          <TextField
            label="Instagram handle"
            placeholder="@coinfrenzy"
            value={v.socialInstagram ?? ''}
            onChange={(s) => setV((p) => ({ ...p, socialInstagram: s }))}
            disabled={busy}
          />
          <TextField
            label="Facebook page"
            placeholder="https://facebook.com/coinfrenzy"
            value={v.socialFacebook ?? ''}
            onChange={(s) => setV((p) => ({ ...p, socialFacebook: s }))}
            disabled={busy}
          />
        </div>
      )}
      onSave={save}
      dirty={dirty}
    />
  )
}

// ----------------------------------------------------------------------------
// RG defaults
// ----------------------------------------------------------------------------

export interface RgValues {
  dailyPurchaseLimitUsd: number
  weeklyPurchaseLimitUsd: number
  monthlyPurchaseLimitUsd: number
  sessionLengthMinutes: number
  coolingOffHours: number
}

export function RgSectionEditor({ initial, canEdit }: { initial: RgValues; canEdit: boolean }) {
  const [v, setV] = React.useState<RgValues>(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  async function save(): Promise<string | null> {
    if (v.weeklyPurchaseLimitUsd < v.dailyPurchaseLimitUsd)
      return 'Weekly limit must be >= daily limit'
    if (v.monthlyPurchaseLimitUsd < v.weeklyPurchaseLimitUsd)
      return 'Monthly limit must be >= weekly limit'
    const res = await fetch('/api/admin/settings/rg-defaults', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) return data?.error ?? `save failed (${res.status})`
    return null
  }

  return (
    <EditableSection
      canEdit={canEdit}
      permissionLabel="master to edit"
      readView={
        <FieldList>
          <FieldRow
            label="Daily purchase limit"
            value={`$${initial.dailyPurchaseLimitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <FieldRow
            label="Weekly purchase limit"
            value={`$${initial.weeklyPurchaseLimitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <FieldRow
            label="Monthly purchase limit"
            value={`$${initial.monthlyPurchaseLimitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <FieldRow label="Default session length" value={`${initial.sessionLengthMinutes} min`} />
          <FieldRow label="Cooling-off default" value={`${initial.coolingOffHours} h`} />
        </FieldList>
      }
      editView={({ busy }) => (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <NumberField
            label="Daily purchase limit (USD)"
            unit="$"
            value={v.dailyPurchaseLimitUsd}
            step={50}
            decimal
            onChange={(n) => setV((p) => ({ ...p, dailyPurchaseLimitUsd: n }))}
            disabled={busy}
          />
          <NumberField
            label="Weekly purchase limit (USD)"
            unit="$"
            value={v.weeklyPurchaseLimitUsd}
            step={100}
            decimal
            onChange={(n) => setV((p) => ({ ...p, weeklyPurchaseLimitUsd: n }))}
            disabled={busy}
          />
          <NumberField
            label="Monthly purchase limit (USD)"
            unit="$"
            value={v.monthlyPurchaseLimitUsd}
            step={500}
            decimal
            onChange={(n) => setV((p) => ({ ...p, monthlyPurchaseLimitUsd: n }))}
            disabled={busy}
          />
          <NumberField
            label="Default session length"
            unit="min"
            value={v.sessionLengthMinutes}
            step={15}
            onChange={(n) => setV((p) => ({ ...p, sessionLengthMinutes: n }))}
            disabled={busy}
          />
          <NumberField
            label="Cooling-off default"
            unit="h"
            value={v.coolingOffHours}
            step={1}
            onChange={(n) => setV((p) => ({ ...p, coolingOffHours: n }))}
            disabled={busy}
          />
        </div>
      )}
      onSave={save}
      dirty={dirty}
    />
  )
}

// ----------------------------------------------------------------------------
// Bonus defaults
// ----------------------------------------------------------------------------

export interface BonusValues {
  defaultPlaythroughMultiplier: number
  defaultPlaythroughWindowHours: number
  defaultExpiryDays: number
  stackingEnabled: boolean
}

export function BonusSectionEditor({
  initial,
  canEdit,
}: {
  initial: BonusValues
  canEdit: boolean
}) {
  const [v, setV] = React.useState<BonusValues>(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  async function save(): Promise<string | null> {
    const res = await fetch('/api/admin/settings/bonus-defaults', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) return data?.error ?? `save failed (${res.status})`
    return null
  }

  return (
    <EditableSection
      canEdit={canEdit}
      readView={
        <FieldList>
          <FieldRow
            label="Default playthrough multiplier"
            value={`${initial.defaultPlaythroughMultiplier.toFixed(1)}×`}
          />
          <FieldRow
            label="Default playthrough window"
            value={`${initial.defaultPlaythroughWindowHours} h`}
            hint={`${Math.round(initial.defaultPlaythroughWindowHours / 24)} days`}
          />
          <FieldRow label="Default expiry window" value={`${initial.defaultExpiryDays} days`} />
          <FieldRow
            label="Stacking"
            value={initial.stackingEnabled ? 'Enabled' : 'Disabled by default'}
          />
        </FieldList>
      }
      editView={({ busy }) => (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <NumberField
            label="Default playthrough multiplier"
            unit="×"
            value={v.defaultPlaythroughMultiplier}
            step={0.1}
            decimal
            onChange={(n) => setV((p) => ({ ...p, defaultPlaythroughMultiplier: n }))}
            disabled={busy}
          />
          <NumberField
            label="Default playthrough window (hours)"
            unit="h"
            value={v.defaultPlaythroughWindowHours}
            step={24}
            onChange={(n) => setV((p) => ({ ...p, defaultPlaythroughWindowHours: n }))}
            disabled={busy}
          />
          <NumberField
            label="Default expiry (days)"
            unit="d"
            value={v.defaultExpiryDays}
            step={1}
            onChange={(n) => setV((p) => ({ ...p, defaultExpiryDays: n }))}
            disabled={busy}
          />
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-ink-tertiary">Stacking</Label>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="stacking-enabled"
                checked={v.stackingEnabled}
                onChange={(e) => setV((p) => ({ ...p, stackingEnabled: e.target.checked }))}
                disabled={busy}
                className="h-4 w-4"
              />
              <label htmlFor="stacking-enabled" className="text-ink-secondary">
                Allow multiple active bonuses to stack
              </label>
            </div>
          </div>
        </div>
      )}
      onSave={save}
      dirty={dirty}
    />
  )
}

// ----------------------------------------------------------------------------
// Redemption caps
// ----------------------------------------------------------------------------

export interface RedemptionValues {
  minRedemptionUsd: number
  maxRedemptionUsd: number
  dailyRedemptionCapUsd: number
  autoApprovalThresholdUsd: number
}

export function RedemptionSectionEditor({
  initial,
  canEdit,
}: {
  initial: RedemptionValues
  canEdit: boolean
}) {
  const [v, setV] = React.useState<RedemptionValues>(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  async function save(): Promise<string | null> {
    if (v.maxRedemptionUsd < v.minRedemptionUsd) return 'Max must be >= min'
    const res = await fetch('/api/admin/settings/redemption-caps', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) return data?.error ?? `save failed (${res.status})`
    return null
  }

  return (
    <EditableSection
      canEdit={canEdit}
      permissionLabel="master to edit"
      readView={
        <FieldList>
          <FieldRow
            label="Auto-approval threshold"
            value={`$${initial.autoApprovalThresholdUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            hint="Fallback cap when no redemption rule matches"
          />
          <FieldRow
            label="Daily redemption cap (per player)"
            value={`$${initial.dailyRedemptionCapUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          />
          <FieldRow
            label="Min redemption"
            value={`$${initial.minRedemptionUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          />
          <FieldRow
            label="Max redemption"
            value={`$${initial.maxRedemptionUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          />
        </FieldList>
      }
      editView={({ busy }) => (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <NumberField
            label="Auto-approval threshold (USD)"
            unit="$"
            value={v.autoApprovalThresholdUsd}
            step={5}
            decimal
            onChange={(n) => setV((p) => ({ ...p, autoApprovalThresholdUsd: n }))}
            disabled={busy}
          />
          <NumberField
            label="Daily redemption cap (USD)"
            unit="$"
            value={v.dailyRedemptionCapUsd}
            step={100}
            decimal
            onChange={(n) => setV((p) => ({ ...p, dailyRedemptionCapUsd: n }))}
            disabled={busy}
          />
          <NumberField
            label="Min redemption (USD)"
            unit="$"
            value={v.minRedemptionUsd}
            step={5}
            decimal
            onChange={(n) => setV((p) => ({ ...p, minRedemptionUsd: n }))}
            disabled={busy}
          />
          <NumberField
            label="Max redemption (USD)"
            unit="$"
            value={v.maxRedemptionUsd}
            step={100}
            decimal
            onChange={(n) => setV((p) => ({ ...p, maxRedemptionUsd: n }))}
            disabled={busy}
          />
        </div>
      )}
      onSave={save}
      dirty={dirty}
    />
  )
}

// ----------------------------------------------------------------------------
// Tiny input primitives (kept local so this file is self-contained)
// ----------------------------------------------------------------------------

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  type?: 'text' | 'email'
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

function NumberField({
  label,
  unit,
  value,
  step,
  decimal,
  onChange,
  disabled,
}: {
  label: string
  unit: string
  value: number
  step: number
  decimal?: boolean
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode={decimal ? 'decimal' : 'numeric'}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = decimal
              ? Number.parseFloat(e.target.value)
              : Number.parseInt(e.target.value, 10)
            onChange(Number.isFinite(n) ? n : 0)
          }}
          disabled={disabled}
          className="font-mono"
        />
        <span className="text-sm text-ink-tertiary">{unit}</span>
      </div>
    </div>
  )
}
