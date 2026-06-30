'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Edit3,
  Globe,
  Key,
  Lock,
  Mail,
  Network,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader } from '@coinfrenzy/ui/primitives/card'
import { StatusPill } from '@coinfrenzy/ui/admin'

import { formatCoins } from '@/lib/format'

interface AggregatorRow {
  id: string
  slug: string
  displayName: string
  status: string
  apiBaseUrl: string | null
  callbackUrl: string | null
  webhookSecretRef: string | null
  features: Record<string, unknown>
  version: string | null
  lastSeenAt: string | null
  errorCount1h: number
  contactEmail: string | null
  notes: string | null
  providerCount: number
  gameCount: number
  ggr30dSc: string
  totalGgr30dSc: string
  healthStatus: 'healthy' | 'degraded' | 'down' | 'unknown'
  createdAt: string
}

interface Props {
  aggregators: AggregatorRow[]
  totalGgrSc: string
  canEdit: boolean
}

// The features grid renders fixed slots so a senior dev landing on the
// page can see at a glance what each aggregator supports / requires.
// Anything outside this list still shows in the raw JSON viewer below.
const FEATURE_SLOTS: { key: string; label: string }[] = [
  { key: 'liveTokens', label: 'Live tokens' },
  { key: 'freeSpins', label: 'Free spins' },
  { key: 'jackpots', label: 'Jackpots' },
  { key: 'demoMode', label: 'Demo mode' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'sandbox', label: 'Sandbox env' },
]

export function AggregatorsClient({ aggregators, canEdit }: Props) {
  const [editing, setEditing] = React.useState<AggregatorRow | null>(null)
  const router = useRouter()

  if (aggregators.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Network className="h-10 w-10 text-ink-tertiary" />
          <div className="text-base font-semibold text-ink-primary">No aggregators yet</div>
          <p className="max-w-sm text-sm text-ink-tertiary">
            AleaPlay is seeded by default. Add a new aggregator by inserting a row into the
            `aggregators` table; this dashboard will surface every field your senior dev needs to
            wire it up.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {aggregators.map((a) => (
          <AggregatorCard key={a.id} agg={a} onEdit={canEdit ? () => setEditing(a) : undefined} />
        ))}
      </div>
      {editing ? (
        <EditDrawer
          agg={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function AggregatorCard({ agg, onEdit }: { agg: AggregatorRow; onEdit?: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-line-subtle pb-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-elevated text-ink-secondary">
            <Network className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-ink-primary">
                {agg.displayName}
              </h3>
              <HealthDot status={agg.healthStatus} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-tertiary">
              <span className="font-mono">{agg.slug}</span>
              {agg.version ? <span>· v{agg.version}</span> : null}
              {agg.status === 'active' ? (
                <StatusPill status="active" />
              ) : (
                <StatusPill status="custom" color="neutral" label={agg.status} />
              )}
            </div>
          </div>
        </div>
        {onEdit ? (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit3 className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Providers" value={agg.providerCount.toLocaleString()} />
          <Stat label="Games" value={agg.gameCount.toLocaleString()} />
          <Stat label="GGR (30d)" value={`${formatCoins(agg.ggr30dSc)} SC`} small />
        </div>

        <FieldRow icon={<Globe />} label="API base URL" value={agg.apiBaseUrl} mono />
        <FieldRow icon={<Globe />} label="Callback URL" value={agg.callbackUrl} mono />
        <FieldRow
          icon={<Key />}
          label="Webhook secret ref"
          value={agg.webhookSecretRef ?? '— (set the Doppler key name)'}
          mono
          subtle={agg.webhookSecretRef !== null}
        >
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-tertiary">
            <Lock className="h-3 w-3" />
            value stored in Doppler
          </span>
        </FieldRow>
        <FieldRow icon={<Mail />} label="Contact" value={agg.contactEmail} />
        <FieldRow
          icon={<ShieldCheck />}
          label="Last seen"
          value={agg.lastSeenAt ? new Date(agg.lastSeenAt).toLocaleString() : '—'}
        />
        <FieldRow
          icon={<AlertTriangle />}
          label="Errors (1h)"
          value={agg.errorCount1h.toString()}
        />

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-secondary">Features</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {FEATURE_SLOTS.map((slot) => {
              const supported = Boolean(agg.features[slot.key])
              return (
                <div
                  key={slot.key}
                  className={
                    'rounded-md border px-2 py-1.5 text-xs ' +
                    (supported
                      ? 'border-positive/40 bg-positive/10 text-positive'
                      : 'border-line-subtle bg-elevated text-ink-tertiary')
                  }
                >
                  <span className="font-medium">{slot.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {agg.notes ? (
          <div className="rounded-md border border-line-subtle bg-elevated px-3 py-2 text-xs text-ink-secondary">
            <span className="text-ink-tertiary">Notes: </span>
            {agg.notes}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md bg-elevated px-2 py-2">
      <div
        className={
          'tabular-nums font-semibold text-ink-primary ' + (small ? 'text-sm' : 'text-base')
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
    </div>
  )
}

function FieldRow({
  icon,
  label,
  value,
  mono,
  subtle,
  children,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  mono?: boolean
  subtle?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 text-ink-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
          {label}
        </div>
        <div
          className={
            'mt-0.5 break-words ' +
            (mono ? 'font-mono ' : '') +
            (subtle ? 'text-ink-secondary' : 'text-ink-primary')
          }
        >
          {value || <span className="text-ink-tertiary">—</span>}
          {children}
        </div>
      </div>
    </div>
  )
}

function HealthDot({ status }: { status: AggregatorRow['healthStatus'] }) {
  const tone =
    status === 'healthy'
      ? { dot: 'bg-positive', label: 'Healthy' }
      : status === 'degraded'
        ? { dot: 'bg-attention', label: 'Degraded' }
        : status === 'down'
          ? { dot: 'bg-critical', label: 'Down' }
          : { dot: 'bg-ink-tertiary', label: 'Unknown' }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
      <span className={'h-1.5 w-1.5 rounded-full ' + tone.dot} />
      {tone.label}
    </span>
  )
}

function EditDrawer({
  agg,
  onClose,
  onSaved,
}: {
  agg: AggregatorRow
  onClose: () => void
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = React.useState(agg.displayName)
  const [apiBaseUrl, setApiBaseUrl] = React.useState(agg.apiBaseUrl ?? '')
  const [callbackUrl, setCallbackUrl] = React.useState(agg.callbackUrl ?? '')
  const [webhookSecretRef, setWebhookSecretRef] = React.useState(agg.webhookSecretRef ?? '')
  const [status, setStatus] = React.useState<'active' | 'inactive'>(
    (agg.status as 'active' | 'inactive') ?? 'active',
  )
  const [version, setVersion] = React.useState(agg.version ?? '')
  const [contactEmail, setContactEmail] = React.useState(agg.contactEmail ?? '')
  const [notes, setNotes] = React.useState(agg.notes ?? '')
  const [features, setFeatures] = React.useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const slot of FEATURE_SLOTS) out[slot.key] = Boolean(agg.features[slot.key])
    return out
  })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/casino/aggregators/${agg.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName,
          apiBaseUrl: apiBaseUrl.trim() === '' ? null : apiBaseUrl.trim(),
          callbackUrl: callbackUrl.trim() === '' ? null : callbackUrl.trim(),
          webhookSecretRef: webhookSecretRef.trim() === '' ? null : webhookSecretRef.trim(),
          status,
          version: version.trim() === '' ? null : version.trim(),
          contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
          notes: notes.trim() === '' ? null : notes,
          features,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'save_failed')
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line-subtle px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">Edit aggregator</div>
            <div className="text-base font-semibold text-ink-primary">{agg.displayName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-md border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical">
              {error}
            </div>
          ) : null}

          <FieldLabel label="Display name">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>

          <FieldLabel label="API base URL">
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 font-mono text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>

          <FieldLabel label="Callback URL (their webhooks → us)">
            <input
              type="url"
              value={callbackUrl}
              onChange={(e) => setCallbackUrl(e.target.value)}
              placeholder="https://api.coinfrenzy.com/webhooks/..."
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 font-mono text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>

          <FieldLabel
            label="Webhook secret ref"
            hint="The Doppler key name only — never the secret value. The senior dev sets the actual secret in Doppler."
          >
            <input
              type="text"
              value={webhookSecretRef}
              onChange={(e) => setWebhookSecretRef(e.target.value)}
              placeholder="ALEA_WEBHOOK_SECRET"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 font-mono text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>

          <FieldLabel label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary focus:border-line-default focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FieldLabel>

          <FieldLabel label="Version">
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="2024-08-01"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 font-mono text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>

          <FieldLabel label="Contact email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="support@vendor.com"
              className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>

          <FieldLabel label="Features">
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_SLOTS.map((slot) => (
                <label
                  key={slot.key}
                  className="inline-flex items-center gap-2 rounded-md border border-line-subtle bg-surface px-2 py-1.5 text-xs text-ink-secondary"
                >
                  <input
                    type="checkbox"
                    checked={!!features[slot.key]}
                    onChange={(e) =>
                      setFeatures((prev) => ({ ...prev, [slot.key]: e.target.checked }))
                    }
                    className="h-4 w-4 accent-positive"
                  />
                  {slot.label}
                </label>
              ))}
            </div>
          </FieldLabel>

          <FieldLabel label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-line-subtle bg-surface px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
          </FieldLabel>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" onClick={onSubmit} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </aside>
    </div>
  )
}

function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-ink-tertiary">{hint}</span> : null}
    </label>
  )
}
