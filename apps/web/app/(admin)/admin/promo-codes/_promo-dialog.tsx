'use client'

import * as React from 'react'
import { Gift, ShoppingCart, Sparkles, Ticket, Zap } from 'lucide-react'

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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit promo code' : 'Create promo code'}</DialogTitle>
          <DialogDescription>
            A promo code is shorthand for a bonus template. Pick the bonus, decide where the code
            can be used, and set the limits.
          </DialogDescription>
        </DialogHeader>

        {/* Code + description */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setField('code', e.target.value.toUpperCase())}
              placeholder="SUMMER25"
              disabled={!!editing}
              className="font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">
              {editing
                ? 'The code itself is locked once created.'
                : 'Players type this exactly. Uppercase, alphanumeric (+ _ -).'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Internal description (optional)</Label>
            <Input
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Summer 2026 affiliate push"
            />
          </div>
        </div>

        {/* Bonus template picker */}
        <div className="space-y-2 pt-2">
          <Label className="text-xs">Which bonus does this code give?</Label>
          {templates.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              No active bonus templates exist. Create one in{' '}
              <a href="/admin/bonus/templates" className="text-foreground underline">
                Bonus templates
              </a>{' '}
              first.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {templates.map((t) => {
                const selected = form.bonusId === t.id
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setField('bonusId', t.id)}
                    className={
                      'flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left transition-colors last:border-b-0 ' +
                      (selected ? 'bg-foreground/5' : 'hover:bg-muted/50')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.displayName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{t.slug}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="font-semibold tabular-nums">{formatCoins(t.awardSc)} SC</p>
                      <p className="text-muted-foreground tabular-nums">
                        {formatCoins(t.awardGc)} GC · {Number(t.playthroughMultiplier).toFixed(1)}×
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Context picker */}
        <div className="space-y-2 pt-2">
          <Label className="text-xs">How can players use this code?</Label>
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
                    'flex items-start gap-2 rounded-md border p-3 text-left transition-colors ' +
                    (selected
                      ? 'border-foreground bg-foreground/5'
                      : 'border-border hover:border-foreground/40 hover:bg-muted/30')
                  }
                >
                  <Icon
                    className={
                      'mt-0.5 h-4 w-4 shrink-0 ' +
                      (selected ? 'text-foreground' : 'text-muted-foreground')
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{opt.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Limits + validity */}
        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Uses per player</Label>
            <Input
              type="number"
              min="0"
              value={form.maxPerPlayer}
              onChange={(e) => setField('maxPerPlayer', e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">Blank = unlimited.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Total uses cap</Label>
            <Input
              type="number"
              min="0"
              value={form.maxTotalUses}
              onChange={(e) => setField('maxTotalUses', e.target.value)}
              placeholder="1000"
            />
            <p className="text-xs text-muted-foreground">Blank = unlimited globally.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valid from</Label>
            <Input
              type="datetime-local"
              value={form.validFrom}
              onChange={(e) => setField('validFrom', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Blank = active immediately.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valid until</Label>
            <Input
              type="datetime-local"
              value={form.validUntil}
              onChange={(e) => setField('validUntil', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Blank = never expires.</p>
          </div>
        </div>

        {/* Advanced */}
        <button
          type="button"
          onClick={() => setField('showAdvanced', !form.showAdvanced)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {form.showAdvanced ? '▾' : '▸'} Advanced (per-code overrides, domain blocks)
        </button>

        {form.showAdvanced && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Playthrough multiplier override</Label>
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
              <div className="space-y-1">
                <Label className="text-xs">Playthrough window (hours) override</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.playthroughWindowHours}
                  onChange={(e) => setField('playthroughWindowHours', e.target.value)}
                  placeholder="Blank = use template default (typically 168h)"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Block these email domains</Label>
              <Input
                value={form.blockedDomains}
                onChange={(e) => setField('blockedDomains', e.target.value)}
                placeholder="mailinator.com, tempmail.io"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. Anti-abuse: these domains can&apos;t redeem this specific code.
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
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
