'use client'

import * as React from 'react'
import { Ban, Gift, Pencil, Power, ShoppingCart, Sparkles, Ticket, Zap } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@coinfrenzy/ui/primitives/table'

/**
 * Templates panel — operator UI.
 *
 * The form is organized by operator INTENT (purpose) instead of by the
 * 14-value enum in the DB. Each purpose maps to one concrete bonus_type
 * value behind the scenes. Operators never see "tier_up" vs "weekly_tier"
 * — those slots are managed by the system templates the engine looks up
 * by slug. Operators create/edit:
 *
 *   1. PURCHASE — % SC/GC on top of a buy. Engine treats this as a
 *      `package` bonus that the purchase webhook attaches automatically.
 *   2. PLAYER GIFT — manual / CRM-targeted award (high-roller treat,
 *      loss-back, win-back). Stored as `promotion`.
 *   3. PROMO CODE — code-redeemable bonus (standalone or signup). Stored
 *      as `crm_promocode` for free codes, `welcome` for signup codes.
 *
 * "Cooldown hours" and "Playthrough window hours" are deliberately hidden
 * — the engine defaults to a 168h (1 week) window and no cooldown, which
 * matches industry norms. Power users with an unusual case can still
 * unhide via Advanced.
 */

const PURPOSES = [
  {
    id: 'purchase',
    label: 'Purchase bonus',
    description: 'Extra SC/GC on top of a purchase.',
    icon: ShoppingCart,
    bonusType: 'package',
  },
  {
    id: 'player_gift',
    label: 'Player gift',
    description: 'Targeted bonus for VIPs, loss-back, win-back.',
    icon: Sparkles,
    bonusType: 'promotion',
  },
  {
    id: 'promo_code_signup',
    label: 'Signup promo code',
    description: 'Code redeemable only at registration.',
    icon: Ticket,
    bonusType: 'welcome',
  },
  {
    id: 'promo_code_free',
    label: 'Free promo code',
    description: 'Free gift code players enter from the rewards menu.',
    icon: Gift,
    bonusType: 'crm_promocode',
  },
] as const

type PurposeId = (typeof PURPOSES)[number]['id']

/** Map a stored bonus_type back to a UI purpose (so the edit dialog opens
 * on the right card). Falls back to player_gift for legacy types. */
const BONUS_TYPE_TO_PURPOSE: Record<string, PurposeId> = {
  package: 'purchase',
  purchase_promocode: 'purchase',
  welcome: 'promo_code_signup',
  crm_promocode: 'promo_code_free',
  promotion: 'player_gift',
  admin_added_sc: 'player_gift',
  affiliate: 'player_gift',
  referral: 'player_gift',
  amoe: 'player_gift',
  daily: 'player_gift',
  tier_up: 'player_gift',
  weekly_tier: 'player_gift',
  monthly_tier: 'player_gift',
  jackpot: 'player_gift',
}

const INSTANCE_OPTIONS = [
  { value: '1', label: 'One-time only', maxPerPlayer: 1, stackable: false },
  { value: '2', label: 'Up to 2 per player', maxPerPlayer: 2, stackable: true },
  { value: '3', label: 'Up to 3 per player', maxPerPlayer: 3, stackable: true },
  { value: '5', label: 'Up to 5 per player', maxPerPlayer: 5, stackable: true },
  { value: '10', label: 'Up to 10 per player', maxPerPlayer: 10, stackable: true },
  { value: 'unlimited', label: 'Unlimited', maxPerPlayer: null, stackable: true },
] as const

type InstanceValue = (typeof INSTANCE_OPTIONS)[number]['value']

function instanceFromTemplate(t: {
  maxPerPlayer: number | null
  stackable: boolean
}): InstanceValue {
  if (t.maxPerPlayer === 1 || (!t.stackable && t.maxPerPlayer === null)) return '1'
  if (t.maxPerPlayer === null) return 'unlimited'
  const match = INSTANCE_OPTIONS.find((o) => o.maxPerPlayer === t.maxPerPlayer)
  return match ? match.value : 'unlimited'
}

export interface TemplateRow {
  id: string
  slug: string
  displayName: string
  bonusType: string
  /** Money minor-unit strings (we serialize bigints across the wire). */
  awardGc: string
  awardSc: string
  playthroughMultiplier: string
  playthroughWindowHours: number | null
  minBetForContribution: string | null
  maxBetDuringPlaythrough: string | null
  maxPerPlayer: number | null
  cooldownHours: number | null
  stackable: boolean
  status: string
  awardedCountLifetime: number
  updatedAt: string
}

interface FormState {
  purpose: PurposeId
  slug: string
  displayName: string
  awardScMajor: string
  awardGcMajor: string
  playthroughMultiplier: string
  instances: InstanceValue
  minBetMajor: string
  maxBetMajor: string
  description: string
  terms: string
  showAdvanced: boolean
}

const EMPTY_FORM: FormState = {
  purpose: 'player_gift',
  slug: '',
  displayName: '',
  awardScMajor: '',
  awardGcMajor: '',
  playthroughMultiplier: '3',
  instances: '1',
  minBetMajor: '',
  maxBetMajor: '',
  description: '',
  terms: '',
  showAdvanced: false,
}

export function TemplatesPanel({ templates }: { templates: TemplateRow[] }) {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TemplateRow | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(template: TemplateRow) {
    setEditing(template)
    setOpen(true)
  }

  async function toggleStatus(t: TemplateRow) {
    setBusyId(t.id)
    try {
      const next = t.status === 'active' ? 'inactive' : 'active'
      const res = await fetch(`/api/admin/bonus/templates/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        alert(body.error ?? `Failed (${res.status})`)
        return
      }
      window.location.reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate}>Create bonus</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Award (SC / GC)</TableHead>
              <TableHead>Playthrough</TableHead>
              <TableHead>Per player</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Awarded</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  No bonuses yet. Click &ldquo;Create bonus&rdquo; to add one.
                </TableCell>
              </TableRow>
            )}
            {templates.map((t) => {
              const purpose =
                PURPOSES.find((p) => p.id === BONUS_TYPE_TO_PURPOSE[t.bonusType]) ?? PURPOSES[1]
              const Icon = purpose.icon
              const instance = instanceFromTemplate(t)
              const instanceLabel =
                INSTANCE_OPTIONS.find((o) => o.value === instance)?.label ?? 'Unlimited'
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.displayName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{t.slug}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
                      <Icon className="h-3 w-3" />
                      {purpose.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {majorFormat(t.awardSc)} / {majorFormat(t.awardGc)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {Number(t.playthroughMultiplier).toFixed(2)}×
                  </TableCell>
                  <TableCell className="text-xs">{instanceLabel}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        t.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {t.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.awardedCountLifetime}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(t)}
                        disabled={busyId === t.id || t.status === 'archived'}
                        title={t.status === 'active' ? 'Deactivate' : 'Activate'}
                      >
                        {t.status === 'active' ? (
                          <Ban className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <TemplateDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  )
}

function TemplateDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: TemplateRow | null
}) {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        purpose: BONUS_TYPE_TO_PURPOSE[editing.bonusType] ?? 'player_gift',
        slug: editing.slug,
        displayName: editing.displayName,
        awardScMajor: bigintToMajor(editing.awardSc),
        awardGcMajor: bigintToMajor(editing.awardGc),
        playthroughMultiplier: editing.playthroughMultiplier,
        instances: instanceFromTemplate(editing),
        minBetMajor: editing.minBetForContribution
          ? bigintToMajor(editing.minBetForContribution)
          : '',
        maxBetMajor: editing.maxBetDuringPlaythrough
          ? bigintToMajor(editing.maxBetDuringPlaythrough)
          : '',
        description: '',
        terms: '',
        showAdvanced: false,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError(null)
  }, [editing, open])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Auto-fill slug from display name in create mode.
  React.useEffect(() => {
    if (editing || !form.displayName) return
    const auto = form.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60)
    setForm((prev) => (prev.slug ? prev : { ...prev, slug: auto }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.displayName])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const purpose = PURPOSES.find((p) => p.id === form.purpose)
      if (!purpose) {
        setError('Pick what kind of bonus this is.')
        setSubmitting(false)
        return
      }
      const instanceOpt =
        INSTANCE_OPTIONS.find((o) => o.value === form.instances) ?? INSTANCE_OPTIONS[0]

      const body = {
        slug: form.slug.trim(),
        displayName: form.displayName.trim(),
        bonusType: purpose.bonusType,
        awardSc: majorToMinor(form.awardScMajor),
        awardGc: majorToMinor(form.awardGcMajor),
        playthroughMultiplier: Number(form.playthroughMultiplier) || 0,
        // Defaults that used to be UI-visible. 168h = 1 week window;
        // no cooldown. Power users with edge cases can patch via API.
        playthroughWindowHours: 168,
        minBetForContribution: form.minBetMajor ? majorToMinor(form.minBetMajor) : null,
        maxBetDuringPlaythrough: form.maxBetMajor ? majorToMinor(form.maxBetMajor) : null,
        maxPerPlayer: instanceOpt.maxPerPlayer,
        cooldownHours: null,
        stackable: instanceOpt.stackable,
        description: form.description.trim() || null,
        terms: form.terms.trim() || null,
      }
      const res = await fetch(
        editing ? `/api/admin/bonus/templates/${editing.id}` : '/api/admin/bonus/templates',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        setError(e.error ?? 'Save failed.')
        setSubmitting(false)
        return
      }
      onOpenChange(false)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const purposeMeta = PURPOSES.find((p) => p.id === form.purpose) ?? PURPOSES[1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit bonus' : 'Create bonus'}</DialogTitle>
          <DialogDescription>
            Amounts are in major units (<code>5.00</code> = 5 SC). Playthrough is the multiplier (3
            = 3×). Playthrough window defaults to 1 week.
          </DialogDescription>
        </DialogHeader>

        {/* Purpose picker — the top of the funnel */}
        <div className="space-y-2">
          <Label className="text-xs">What kind of bonus is this?</Label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {PURPOSES.map((p) => {
              const Icon = p.icon
              const selected = form.purpose === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setField('purpose', p.id)}
                  className={
                    'flex flex-col items-start gap-1.5 rounded-md border px-3 py-3 text-left transition-colors ' +
                    (selected
                      ? 'border-foreground bg-foreground/5'
                      : 'border-border hover:border-foreground/40 hover:bg-muted/40')
                  }
                >
                  <Icon
                    className={
                      'h-4 w-4 ' + (selected ? 'text-foreground' : 'text-muted-foreground')
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Display name">
            <Input
              value={form.displayName}
              onChange={(e) => setField('displayName', e.target.value)}
              placeholder={
                purposeMeta.id === 'purchase'
                  ? 'Weekend boost'
                  : purposeMeta.id === 'promo_code_signup'
                    ? 'Welcome SUNNY'
                    : purposeMeta.id === 'promo_code_free'
                      ? 'Lightning gift'
                      : 'High roller treat'
              }
            />
          </Field>
          <Field
            label="Slug"
            hint={
              editing
                ? 'Slug is locked once created.'
                : 'Auto-generated from name. Used by triggers / promo codes.'
            }
          >
            <Input
              value={form.slug}
              onChange={(e) => setField('slug', e.target.value)}
              placeholder="welcome_default"
              disabled={!!editing}
            />
          </Field>

          <Field
            label="Award SC"
            hint={
              purposeMeta.id === 'purchase'
                ? 'Flat SC added on top of the purchase.'
                : 'Sweepstakes coins (player-facing currency).'
            }
          >
            <Input
              type="text"
              value={form.awardScMajor}
              onChange={(e) => setField('awardScMajor', e.target.value)}
              placeholder="5.00"
              inputMode="decimal"
            />
          </Field>
          <Field
            label="Award GC"
            hint={
              purposeMeta.id === 'purchase'
                ? 'Flat GC added on top of the purchase.'
                : 'Gold coins (free-play currency).'
            }
          >
            <Input
              type="text"
              value={form.awardGcMajor}
              onChange={(e) => setField('awardGcMajor', e.target.value)}
              placeholder="10000.00"
              inputMode="decimal"
            />
          </Field>

          <Field
            label="Playthrough multiplier (×)"
            hint="Most operators use 1×. Higher = stickier SC."
          >
            <Input
              type="number"
              step="0.5"
              min="0"
              value={form.playthroughMultiplier}
              onChange={(e) => setField('playthroughMultiplier', e.target.value)}
            />
          </Field>
          <Field label="Times a player can receive this">
            <select
              className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              value={form.instances}
              onChange={(e) => setField('instances', e.target.value as InstanceValue)}
            >
              {INSTANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description (shown to players)">
          <textarea
            className="border-input bg-background min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder={
              purposeMeta.id === 'purchase'
                ? 'Buy any package this weekend and get 25% extra SC + 50% extra GC.'
                : 'Short, friendly copy that appears in the rewards menu.'
            }
          />
        </Field>

        <button
          type="button"
          onClick={() => setField('showAdvanced', !form.showAdvanced)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {form.showAdvanced ? '▾' : '▸'} Advanced (rarely needed)
        </button>

        {form.showAdvanced && (
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Min bet for contribution"
                hint="Bets below this don't count toward playthrough. Leave blank for $0."
              >
                <Input
                  type="text"
                  value={form.minBetMajor}
                  onChange={(e) => setField('minBetMajor', e.target.value)}
                  placeholder="0.50"
                />
              </Field>
              <Field
                label="Max bet during playthrough"
                hint="Caps players exploiting bonuses with huge single spins. Leave blank for no cap."
              >
                <Input
                  type="text"
                  value={form.maxBetMajor}
                  onChange={(e) => setField('maxBetMajor', e.target.value)}
                  placeholder="10.00"
                />
              </Field>
            </div>
            <Field label="Terms (full T&Cs)">
              <textarea
                className="border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                value={form.terms}
                onChange={(e) => setField('terms', e.target.value)}
              />
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Cooldown and playthrough window are managed by the engine (default: 1-week window, no
              cooldown). Contact engineering if you need an exception.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !form.displayName || !form.slug}>
            {submitting ? (
              'Saving…'
            ) : editing ? (
              'Save changes'
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" /> Create bonus
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---- helpers ----

function bigintToMajor(minor: string): string {
  const big = BigInt(minor)
  const negative = big < 0n
  const abs = negative ? -big : big
  const major = abs / 10_000n
  const remainder = abs % 10_000n
  return (
    `${negative ? '-' : ''}${major}.${remainder.toString().padStart(4, '0')}`.replace(
      /\.?0+$/,
      '',
    ) || '0'
  )
}

function majorFormat(minor: string): string {
  const big = BigInt(minor)
  const major = big / 10_000n
  const rem = big % 10_000n
  return `${major}.${rem.toString().padStart(4, '0').slice(0, 2)}`
}

function majorToMinor(majorStr: string): string {
  const trimmed = majorStr.trim()
  if (!trimmed) return '0'
  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  const [intPart = '0', fracPart = ''] = abs.split('.')
  const fracPadded = (fracPart + '0000').slice(0, 4)
  const value = BigInt(intPart) * 10_000n + BigInt(fracPadded || '0')
  return `${negative ? '-' : ''}${value.toString()}`
}
