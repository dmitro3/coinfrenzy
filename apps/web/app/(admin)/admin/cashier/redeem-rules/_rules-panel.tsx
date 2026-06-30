'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Pencil, Plus, ShieldCheck, ShieldOff } from 'lucide-react'

import { Badge } from '@coinfrenzy/ui/primitives/badge'
import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@coinfrenzy/ui/primitives/table'

import { formatUsd } from '@/lib/format'

// docs/07 §5.1 — admin client for the Redeem Rules page.

export interface RuleRow {
  id: string
  title: string
  description: string | null
  priority: number
  isActive: boolean
  action: 'auto_approve' | 'route_to_review'
  maxAmountUsd: string | null
  minAmountUsd: string | null
  requiredKycLevels: number[]
  blockedStates: string[]
  requirePriorPaidRedemption: boolean
  completionHours: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

interface FormState {
  title: string
  description: string
  priority: string
  isActive: boolean
  action: 'auto_approve' | 'route_to_review'
  maxAmountUsdMajor: string
  minAmountUsdMajor: string
  requiredKycLevels: string // comma-separated 0..5
  blockedStates: string // comma-separated 2-letter codes
  requirePriorPaidRedemption: boolean
  completionHours: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  priority: '100',
  isActive: true,
  action: 'auto_approve',
  maxAmountUsdMajor: '',
  minAmountUsdMajor: '',
  requiredKycLevels: '4,5',
  blockedStates: '',
  requirePriorPaidRedemption: true,
  completionHours: '0',
}

interface PanelProps {
  rules: RuleRow[]
  canEdit: boolean
}

export function RedeemRulesPanel({ rules, canEdit }: PanelProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RuleRow | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [archiveTarget, setArchiveTarget] = React.useState<RuleRow | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setOpen(true)
  }

  function openEdit(rule: RuleRow) {
    setEditing(rule)
    setForm({
      title: rule.title,
      description: rule.description ?? '',
      priority: String(rule.priority),
      isActive: rule.isActive,
      action: rule.action,
      maxAmountUsdMajor: rule.maxAmountUsd ? minorToMajor(rule.maxAmountUsd) : '',
      minAmountUsdMajor: rule.minAmountUsd ? minorToMajor(rule.minAmountUsd) : '',
      requiredKycLevels: rule.requiredKycLevels.join(','),
      blockedStates: rule.blockedStates.join(','),
      requirePriorPaidRedemption: rule.requirePriorPaidRedemption,
      completionHours: String(rule.completionHours),
    })
    setError(null)
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const body = formToPayload(form)
      if ('error' in body) {
        setError(body.error)
        return
      }
      const url = editing
        ? `/api/admin/cashier/redeem-rules/${editing.id}`
        : '/api/admin/cashier/redeem-rules'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body.payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        const detail = b.details?.detail ?? b.error ?? `HTTP ${res.status}`
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(rule: RuleRow) {
    if (!canEdit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cashier/redeem-rules/${rule.id}/toggle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function archive(rule: RuleRow) {
    if (!canEdit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cashier/redeem-rules/${rule.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `HTTP ${res.status}`)
      }
      setArchiveTarget(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const activeRules = rules.filter((r) => !r.archivedAt)

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Read-only view. Editing redemption rules requires the Manager role or higher.
        </div>
      ) : null}
      {error && !open && !archiveTarget ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Rules evaluate top-to-bottom by priority. First match wins. Unmatched redemptions go to{' '}
          <code className="rounded bg-muted px-1 py-0.5">pending_review</code>.
        </p>
        {canEdit ? (
          <Button onClick={openCreate} size="sm" disabled={busy}>
            <Plus className="mr-1 h-4 w-4" /> Create rule
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Priority</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Amount range</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                  No rules configured — every redemption will fall through to manual review.
                </TableCell>
              </TableRow>
            ) : (
              activeRules.map((rule) => (
                <TableRow key={rule.id} className={!rule.isActive ? 'opacity-60' : undefined}>
                  <TableCell className="font-mono text-xs">{rule.priority}</TableCell>
                  <TableCell>
                    <div className="font-medium">{rule.title}</div>
                    {rule.description ? (
                      <div className="text-xs text-muted-foreground">{rule.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.action === 'auto_approve' ? 'success' : 'warning'}>
                      {rule.action === 'auto_approve' ? 'Auto-approve' : 'Force review'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {describeAmount(rule.minAmountUsd, rule.maxAmountUsd)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {rule.requiredKycLevels.length > 0
                      ? rule.requiredKycLevels.map((l) => `K${l}`).join(' / ')
                      : 'Any'}
                  </TableCell>
                  <TableCell className="space-y-0.5 text-[11px] text-muted-foreground">
                    {rule.requirePriorPaidRedemption ? (
                      <div>Requires prior paid redemption</div>
                    ) : null}
                    {rule.blockedStates.length > 0 ? (
                      <div>Excludes: {rule.blockedStates.join(', ')}</div>
                    ) : null}
                    {rule.completionHours > 0 ? <div>ETA {rule.completionHours}h</div> : null}
                    {!rule.requirePriorPaidRedemption &&
                    rule.blockedStates.length === 0 &&
                    rule.completionHours === 0 ? (
                      <div className="italic">No extras</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {rule.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {canEdit ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggle(rule)}
                          disabled={busy}
                          title={rule.isActive ? 'Disable rule' : 'Enable rule'}
                        >
                          {rule.isActive ? (
                            <ShieldOff className="h-4 w-4" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(rule)}
                          disabled={busy}
                          title="Edit rule"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchiveTarget(rule)}
                          disabled={busy}
                          title="Archive rule"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">read-only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => (!busy ? setOpen(v) : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit rule: ${editing.title}` : 'Create redeem rule'}
            </DialogTitle>
            <DialogDescription>
              Rules run in priority order. Lower priority numbers evaluate first. The first rule
              whose conditions match decides what happens; if no rule matches, the redemption goes
              to the cashier&apos;s review queue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. $500 or less instant"
                disabled={busy}
              />
            </Field>
            <Field label="Priority" hint="Lower number = evaluated first.">
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                disabled={busy}
              />
            </Field>
            <Field label="Action" className="md:col-span-2">
              <select
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={form.action}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action: e.target.value as 'auto_approve' | 'route_to_review',
                  })
                }
                disabled={busy}
              >
                <option value="auto_approve">Auto-approve (skip cashier review)</option>
                <option value="route_to_review">Force review (always queue for cashier)</option>
              </select>
            </Field>
            <Field label="Description (optional)" className="md:col-span-2">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short note for other admins"
                disabled={busy}
              />
            </Field>
            <Field label="Max amount (USD)" hint="Leave blank for no upper bound.">
              <Input
                value={form.maxAmountUsdMajor}
                onChange={(e) => setForm({ ...form, maxAmountUsdMajor: e.target.value })}
                placeholder="500"
                inputMode="decimal"
                disabled={busy}
              />
            </Field>
            <Field label="Min amount (USD)" hint="Leave blank for no lower bound.">
              <Input
                value={form.minAmountUsdMajor}
                onChange={(e) => setForm({ ...form, minAmountUsdMajor: e.target.value })}
                placeholder="0"
                inputMode="decimal"
                disabled={busy}
              />
            </Field>
            <Field
              label="Required KYC levels"
              hint="Comma-separated. e.g. 4,5 means only KYC L4 and L5 match. Empty = any KYC level."
            >
              <Input
                value={form.requiredKycLevels}
                onChange={(e) => setForm({ ...form, requiredKycLevels: e.target.value })}
                placeholder="4,5"
                disabled={busy}
              />
            </Field>
            <Field
              label="Blocked states"
              hint="2-letter state codes (e.g. WA, MI). Empty = no state restriction."
            >
              <Input
                value={form.blockedStates}
                onChange={(e) => setForm({ ...form, blockedStates: e.target.value })}
                placeholder="WA, MI"
                disabled={busy}
              />
            </Field>
            <Field label="Completion ETA (hours)" hint="Operator-facing only. 0 = instant.">
              <Input
                type="number"
                value={form.completionHours}
                onChange={(e) => setForm({ ...form, completionHours: e.target.value })}
                disabled={busy}
              />
            </Field>
            <Field label="" className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.requirePriorPaidRedemption}
                  onChange={(e) =>
                    setForm({ ...form, requirePriorPaidRedemption: e.target.checked })
                  }
                  disabled={busy}
                />
                Require at least one prior paid redemption
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  disabled={busy}
                />
                Active
              </label>
            </Field>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(v) => (!busy ? (!v ? setArchiveTarget(null) : null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive rule?</DialogTitle>
            <DialogDescription>
              <strong>{archiveTarget?.title}</strong> will be deactivated and hidden from the live
              rule list. Existing audit history is preserved. If you need it back later, ask
              engineering to flip <code>archived_at</code> back to NULL.
            </DialogDescription>
          </DialogHeader>
          {error && archiveTarget ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiveTarget && void archive(archiveTarget)}
              disabled={busy}
            >
              {busy ? 'Archiving…' : 'Archive rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {label ? <Label className="mb-1 block text-xs">{label}</Label> : null}
      {children}
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function describeAmount(min: string | null, max: string | null): string {
  if (!min && !max) return 'Any amount'
  if (max && !min) return `≤ ${formatUsd(max)}`
  if (min && !max) return `≥ ${formatUsd(min)}`
  if (min && max) return `${formatUsd(min)} – ${formatUsd(max)}`
  return 'Any amount'
}

interface ParsedPayload {
  title: string
  description: string | null
  priority: number
  isActive: boolean
  action: 'auto_approve' | 'route_to_review'
  maxAmountUsd: string | null
  minAmountUsd: string | null
  requiredKycLevels: number[]
  blockedStates: string[]
  requirePriorPaidRedemption: boolean
  completionHours: number
}

function formToPayload(form: FormState): { payload: ParsedPayload } | { error: string } {
  if (!form.title.trim()) return { error: 'Title is required.' }
  const priority = Number(form.priority)
  if (!Number.isFinite(priority) || priority < 0) {
    return { error: 'Priority must be a non-negative integer.' }
  }
  const completionHours = Number(form.completionHours)
  if (!Number.isFinite(completionHours) || completionHours < 0) {
    return { error: 'Completion hours must be a non-negative integer.' }
  }
  const requiredKycLevels: number[] = []
  if (form.requiredKycLevels.trim()) {
    for (const part of form.requiredKycLevels.split(',')) {
      const n = Number(part.trim())
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        return { error: `Invalid KYC level: ${part}` }
      }
      requiredKycLevels.push(n)
    }
  }
  const blockedStates: string[] = []
  if (form.blockedStates.trim()) {
    for (const part of form.blockedStates.split(',')) {
      const code = part.trim().toUpperCase()
      if (code && !/^[A-Z]{2}$/.test(code)) {
        return { error: `Invalid state code: ${part}` }
      }
      if (code) blockedStates.push(code)
    }
  }
  const maxAmountUsd = parseUsdInput(form.maxAmountUsdMajor)
  const minAmountUsd = parseUsdInput(form.minAmountUsdMajor)
  if ('error' in maxAmountUsd) return { error: maxAmountUsd.error }
  if ('error' in minAmountUsd) return { error: minAmountUsd.error }

  return {
    payload: {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority,
      isActive: form.isActive,
      action: form.action,
      maxAmountUsd: maxAmountUsd.value,
      minAmountUsd: minAmountUsd.value,
      requiredKycLevels,
      blockedStates,
      requirePriorPaidRedemption: form.requirePriorPaidRedemption,
      completionHours,
    },
  }
}

function parseUsdInput(raw: string): { value: string | null } | { error: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null }
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { error: `Invalid amount: ${raw}` }
  }
  return { value: trimmed }
}

function minorToMajor(value: string): string {
  if (value.includes('.')) return value
  const big = BigInt(value)
  const negative = big < 0n
  const abs = negative ? -big : big
  const major = abs / 10_000n
  const minor = abs % 10_000n
  const minorTwo = (minor * 100n + 5_000n) / 10_000n
  return `${negative ? '-' : ''}${major}.${minorTwo.toString().padStart(2, '0')}`
}
