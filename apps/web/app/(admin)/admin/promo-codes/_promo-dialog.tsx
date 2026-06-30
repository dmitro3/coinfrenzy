'use client'

import * as React from 'react'
import { Check, Gift, ShoppingCart, Sparkles, Ticket, Zap } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'

import { formatCoins } from '@/lib/format'

/**
 * Promo code create / edit dialog.
 *
 * A promo code is a wrapper around a bonus template. The operator picks
 * what bonus to award (the template), then sets:
 *   - where players can use the code (signup / purchase / anywhere)
 *   - usage caps (per player + global)
 *   - validity window
 *   - optional: per-code playthrough overrides (Advanced)
 *   - optional: email-domain blocklist (Advanced)
 *
 * The page that mounts this dialog passes the list of active bonus
 * templates so we don't roundtrip the server on every open.
 */

export interface BonusTemplateOption {
  id: string
  slug: string
  displayName: string
  bonusType: string
  awardSc: string // minor units
  awardGc: string
  playthroughMultiplier: string
  category: 'purchase' | 'player_gift' | 'promo_code_signup' | 'promo_code_free'
}

export interface PromoCodeEditable {
  id: string
  code: string
  description: string | null
  bonusId: string
  requiredContext: string | null
  maxPerPlayer: number | null
  maxTotalUses: number | null
  validFrom: string | null
  validUntil: string | null
  playthroughMultiplier: string | null
  playthroughWindowHours: number | null
  blockedEmailDomains: string[] | null
  status: string
}

type ContextOption = {
  id: 'signup' | 'purchase' | 'standalone' | 'any'
  label: string
  description: string
  icon: typeof Ticket
}

const CONTEXT_OPTIONS: ContextOption[] = [
  {
    id: 'standalone',
    label: 'Free gift code',
    description: 'Players enter from the lightning-bolt rewards menu.',
    icon: Gift,
  },
  {
    id: 'signup',
    label: 'Signup-only code',
    description: 'Applied at registration. Required referral / welcome.',
    icon: Sparkles,
  },
  {
    id: 'purchase',
    label: 'Purchase boost code',
    description: 'Applied during checkout. Stacks on top of the package.',
    icon: ShoppingCart,
  },
  {
    id: 'any',
    label: 'Anywhere',
    description: 'No restriction. Player can use in any flow.',
    icon: Ticket,
  },
]

interface FormState {
  code: string
  description: string
  bonusId: string
  context: ContextOption['id']
  maxPerPlayer: string
  maxTotalUses: string
  validFrom: string
  validUntil: string
  playthroughMultiplier: string
  playthroughWindowHours: string
  blockedDomains: string
  showAdvanced: boolean
}

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  bonusId: '',
  context: 'standalone',
  maxPerPlayer: '1',
  maxTotalUses: '',
  validFrom: '',
  validUntil: '',
  playthroughMultiplier: '',
  playthroughWindowHours: '',
  blockedDomains: '',
  showAdvanced: false,
}

/** Reusable field label — `text-sm font-medium text-ink-primary` keeps it clearly readable */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-ink-primary">{children}</p>
}

/** Reusable section title — larger, uppercase-tracked, visually separates form sections */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-ink-tertiary">{children}</p>
  )
}

/** Light hint text under a field */
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-ink-tertiary">{children}</p>
}

export function PromoCodeDialog({
  open,
  onOpenChange,
  editing,
  templates,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: PromoCodeEditable | null
  templates: BonusTemplateOption[]
  onSaved?: () => void
}) {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        code: editing.code,
        description: editing.description ?? '',
        bonusId: editing.bonusId,
        context: (editing.requiredContext as ContextOption['id']) ?? 'any',
        maxPerPlayer: editing.maxPerPlayer != null ? editing.maxPerPlayer.toString() : '',
        maxTotalUses: editing.maxTotalUses != null ? editing.maxTotalUses.toString() : '',
        validFrom: editing.validFrom ? editing.validFrom.slice(0, 16) : '',
        validUntil: editing.validUntil ? editing.validUntil.slice(0, 16) : '',
        playthroughMultiplier: editing.playthroughMultiplier ?? '',
        playthroughWindowHours:
          editing.playthroughWindowHours != null ? editing.playthroughWindowHours.toString() : '',
        blockedDomains: (editing.blockedEmailDomains ?? []).join(', '),
        showAdvanced:
          editing.playthroughMultiplier != null ||
          editing.playthroughWindowHours != null ||
          (editing.blockedEmailDomains ?? []).length > 0,
      })
    } else {
      setForm({ ...EMPTY_FORM, bonusId: templates[0]?.id ?? '' })
    }
    setError(null)
  }, [editing, open, templates])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const selectedTemplate = templates.find((t) => t.id === form.bonusId) ?? null

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      if (!form.bonusId) {
        setError('Pick a bonus template — that defines what the code awards.')
        setSubmitting(false)
        return
      }
      const domains = form.blockedDomains
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)

      const payload: Record<string, unknown> = {
        description: form.description.trim() || null,
        bonusId: form.bonusId,
        requiredContext: form.context === 'any' ? null : form.context,
        maxPerPlayer: form.maxPerPlayer ? Number(form.maxPerPlayer) : null,
        maxTotalUses: form.maxTotalUses ? Number(form.maxTotalUses) : null,
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        playthroughMultiplier: form.playthroughMultiplier
          ? Number(form.playthroughMultiplier)
          : null,
        playthroughWindowHours: form.playthroughWindowHours
          ? Number(form.playthroughWindowHours)
          : null,
        blockedEmailDomains: domains.length > 0 ? domains : null,
      }

      // Create includes the code; PATCH doesn't (code is immutable).
      if (!editing) {
        payload.code = form.code.trim().toUpperCase()
      }

      const res = await fetch(
        editing ? `/api/admin/promo-codes/${editing.id}` : '/api/admin/promo-codes',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        const errMsg =
          body.error === 'code_taken'
            ? 'That code is already in use. Pick a different one.'
            : body.error === 'bonus_not_found'
              ? 'Selected bonus template no longer exists.'
              : (body.error ?? `Save failed (${res.status}).`)
        setError(errMsg)
        setSubmitting(false)
        return
      }
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden flex flex-col gap-0 p-0 border-line-subtle">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-line-subtle px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight text-ink-primary">
              {editing ? 'Edit promo code' : 'Create promo code'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-ink-secondary">
              A promo code is shorthand for a bonus template. Pick the bonus, decide where the code
              can be used, and set the limits.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 [&::-webkit-scrollbar]:w-[0px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line-default hover:[&::-webkit-scrollbar-thumb]:bg-line-strong">
          {/* ── Code + description ─────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Code details</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Code</FieldLabel>
                <Input
                  value={form.code}
                  onChange={(e) => setField('code', e.target.value.toUpperCase())}
                  placeholder="SUMMER25"
                  disabled={!!editing}
                  className="font-mono uppercase"
                />
                <FieldHint>
                  {editing
                    ? 'The code itself is locked once created.'
                    : 'Uppercase, alphanumeric (+ _ -). Players type this exactly.'}
                </FieldHint>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>
                  Internal description{' '}
                  <span className="text-ink-tertiary font-normal">(optional)</span>
                </FieldLabel>
                <Input
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Summer 2026 affiliate push"
                />
              </div>
            </div>
          </section>

          {/* ── Bonus template picker ──────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>Which bonus does this code give?</SectionTitle>
            {templates.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-subtle bg-surface p-4 text-sm text-ink-secondary">
                No active bonus templates exist. Create one in{' '}
                <a
                  href="/admin/bonus/templates"
                  className="font-medium text-ink-primary underline underline-offset-2"
                >
                  Bonus templates
                </a>{' '}
                first.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-sm border border-line-subtle bg-surface [&::-webkit-scrollbar]:w-[0px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line-default hover:[&::-webkit-scrollbar-thumb]:bg-line-strong">
                {templates.map((t) => {
                  const selected = form.bonusId === t.id
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setField('bonusId', t.id)}
                      className={
                        'relative flex w-full items-center justify-between border-b border-line-subtle px-4 py-2 text-left transition-colors last:border-b-0 ' +
                        (selected ? 'bg-surface-hover pl-3.5' : 'hover:bg-surface-hover')
                      }
                    >
                      {/* Gold left-border accent — sole selection indicator, no extra column */}
                      {selected && (
                        <span
                          className="absolute left-0 top-0 h-full w-[3px] rounded-r bg-brand"
                          aria-hidden="true"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-primary leading-snug">
                          {t.displayName}
                        </p>
                        <p className="font-mono text-[11px] text-ink-tertiary">{t.slug}</p>
                      </div>

                      <div className="shrink-0 text-right ml-4">
                        <p
                          className={`text-sm font-semibold tabular-nums ${selected ? 'text-brand' : 'text-ink-primary'}`}
                        >
                          {formatCoins(t.awardSc)} SC
                        </p>
                        <p className="text-[11px] text-ink-tertiary tabular-nums">
                          {formatCoins(t.awardGc)} GC · {Number(t.playthroughMultiplier).toFixed(1)}
                          ×
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Context picker ─────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>How can players use this code?</SectionTitle>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CONTEXT_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const selected = form.context === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setField('context', opt.id)}
                    className={
                      'relative flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all ' +
                      (selected
                        ? 'border-brand bg-surface-hover'
                        : 'border-line-subtle bg-base hover:border-line-default hover:bg-surface')
                    }
                  >
                    {/* Gold corner dot on selected card */}
                    {selected && (
                      <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand">
                        <Check className="h-2.5 w-2.5 text-black" strokeWidth={3} />
                      </span>
                    )}
                    <Icon
                      className={
                        'mt-0.5 h-4 w-4 shrink-0 ' + (selected ? 'text-brand' : 'text-ink-tertiary')
                      }
                    />
                    <div className="min-w-0 pr-4">
                      <p
                        className={`text-sm font-semibold ${selected ? 'text-ink-primary' : 'text-ink-secondary'}`}
                      >
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-tertiary leading-relaxed">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Limits + validity ──────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>Usage limits &amp; validity window</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Uses per player</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  value={form.maxPerPlayer}
                  onChange={(e) => setField('maxPerPlayer', e.target.value)}
                  placeholder="1"
                />
                <FieldHint>Blank = unlimited per player.</FieldHint>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Total uses cap</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  value={form.maxTotalUses}
                  onChange={(e) => setField('maxTotalUses', e.target.value)}
                  placeholder="1000"
                />
                <FieldHint>Blank = unlimited globally.</FieldHint>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Valid from</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) => setField('validFrom', e.target.value)}
                />
                <FieldHint>Blank = active immediately.</FieldHint>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Valid until</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) => setField('validUntil', e.target.value)}
                />
                <FieldHint>Blank = never expires.</FieldHint>
              </div>
            </div>
          </section>

          {/* ── Advanced ───────────────────────────────────────────── */}
          <section>
            <button
              type="button"
              onClick={() => setField('showAdvanced', !form.showAdvanced)}
              className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary"
            >
              <span className="text-xs">{form.showAdvanced ? '▾' : '▸'}</span>
              Advanced — per-code overrides &amp; domain blocks
            </button>

            {form.showAdvanced && (
              <div className="mt-3 space-y-4 rounded-lg border border-line-subtle bg-surface p-4">
                <SectionTitle>Per-code overrides</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel>Playthrough multiplier override</FieldLabel>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.playthroughMultiplier}
                      onChange={(e) => setField('playthroughMultiplier', e.target.value)}
                      placeholder={
                        selectedTemplate
                          ? `Inherits ${Number(selectedTemplate.playthroughMultiplier).toFixed(1)}× from template`
                          : 'Blank = use template default'
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Playthrough window override (hours)</FieldLabel>
                    <Input
                      type="number"
                      min="1"
                      value={form.playthroughWindowHours}
                      onChange={(e) => setField('playthroughWindowHours', e.target.value)}
                      placeholder="Blank = use template default (168h)"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Block these email domains</FieldLabel>
                  <Input
                    value={form.blockedDomains}
                    onChange={(e) => setField('blockedDomains', e.target.value)}
                    placeholder="mailinator.com, tempmail.io"
                  />
                  <FieldHint>
                    Comma-separated. Anti-abuse: these domains can&apos;t redeem this specific code.
                  </FieldHint>
                </div>
              </div>
            )}
          </section>

          {/* ── Error ─────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/10 px-4 py-3">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-critical">⚠</span>
              <p className="text-sm font-medium text-critical">{error}</p>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <DialogFooter className="shrink-0 border-t border-line-subtle bg-elevated px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !form.bonusId || (!editing && form.code.trim().length < 3)}
          >
            {submitting ? (
              'Saving…'
            ) : editing ? (
              'Save changes'
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" /> Create promo code
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
