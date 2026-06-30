'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

export interface CapValues {
  weeklyScMaxMajor: number
  monthlyScMaxMajor: number
  loginMultMax: number
  /** Decimal fraction (0.25 = 25%). */
  cashbackPctMax: number
}

interface Props {
  initial: CapValues
  ceilings: CapValues
}

const TWO_STAGE_CONFIRM = 'I understand'

export function SafetyCapsClient({ initial, ceilings }: Props) {
  const router = useRouter()
  const [v, setV] = React.useState<CapValues>(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState('')

  const dirty =
    v.weeklyScMaxMajor !== initial.weeklyScMaxMajor ||
    v.monthlyScMaxMajor !== initial.monthlyScMaxMajor ||
    v.loginMultMax !== initial.loginMultMax ||
    v.cashbackPctMax !== initial.cashbackPctMax

  const overCeiling =
    v.weeklyScMaxMajor > ceilings.weeklyScMaxMajor ||
    v.monthlyScMaxMajor > ceilings.monthlyScMaxMajor ||
    v.loginMultMax > ceilings.loginMultMax ||
    v.cashbackPctMax > ceilings.cashbackPctMax

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/safety-caps/tier-caps', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          weeklyScMaxMajor: v.weeklyScMaxMajor,
          monthlyScMaxMajor: v.monthlyScMaxMajor,
          loginMultMax: v.loginMultMax,
          cashbackPctMax: v.cashbackPctMax,
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        field?: string
        max?: string
      } | null
      if (!res.ok || !data?.ok) {
        setError(
          data?.error === 'ceiling_exceeded'
            ? `${data.field ?? 'value'} exceeds engineering ceiling ${data.max ?? ''}`
            : (data?.error ?? 'failed'),
        )
        setBusy(false)
        return
      }
      setConfirmOpen(false)
      setConfirmText('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Weekly SC cap (per tier)"
          unit="SC"
          ceiling={`${ceilings.weeklyScMaxMajor.toLocaleString()} SC`}
          value={v.weeklyScMaxMajor}
          step={100}
          onChange={(n) => setV((s) => ({ ...s, weeklyScMaxMajor: n }))}
        />
        <Field
          label="Monthly SC cap (per tier)"
          unit="SC"
          ceiling={`${ceilings.monthlyScMaxMajor.toLocaleString()} SC`}
          value={v.monthlyScMaxMajor}
          step={500}
          onChange={(n) => setV((s) => ({ ...s, monthlyScMaxMajor: n }))}
        />
        <Field
          label="Daily-login multiplier cap"
          unit="×"
          ceiling={`${ceilings.loginMultMax.toFixed(1)}×`}
          value={v.loginMultMax}
          step={0.1}
          decimal
          onChange={(n) => setV((s) => ({ ...s, loginMultMax: n }))}
        />
        <Field
          label="Cashback % cap"
          unit="%"
          ceiling={`${(ceilings.cashbackPctMax * 100).toFixed(0)}%`}
          value={v.cashbackPctMax * 100}
          step={1}
          decimal
          onChange={(n) => setV((s) => ({ ...s, cashbackPctMax: Math.max(0, n) / 100 }))}
        />
      </div>

      {overCeiling ? (
        <div className="flex items-start gap-2 rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            One or more values exceed the hardcoded engineering ceiling. The save will be rejected
            by the API.
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-rose-300">{error}</div> : null}

      <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setV(initial)}
          disabled={!dirty || busy}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!dirty || overCeiling || busy}
        >
          Save changes
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm safety cap changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-amber-100">
              You are about to widen (or narrow) the limits that protect the platform from
              accidental over-payment. Every tier write will be evaluated against the new ceilings
              going forward. This change is audited.
            </div>
            <Diff
              label="Weekly SC"
              before={`${initial.weeklyScMaxMajor} SC`}
              after={`${v.weeklyScMaxMajor} SC`}
            />
            <Diff
              label="Monthly SC"
              before={`${initial.monthlyScMaxMajor} SC`}
              after={`${v.monthlyScMaxMajor} SC`}
            />
            <Diff
              label="Login mult"
              before={`${initial.loginMultMax.toFixed(2)}×`}
              after={`${v.loginMultMax.toFixed(2)}×`}
            />
            <Diff
              label="Cashback %"
              before={`${(initial.cashbackPctMax * 100).toFixed(0)}%`}
              after={`${(v.cashbackPctMax * 100).toFixed(0)}%`}
            />
            <div>
              <Label
                htmlFor="confirm-text"
                className="text-xs uppercase tracking-wide text-ink-tertiary"
              >
                Type <span className="font-mono text-ink-secondary">{TWO_STAGE_CONFIRM}</span> to
                enable Save
              </Label>
              <Input
                id="confirm-text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={TWO_STAGE_CONFIRM}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={busy || confirmText !== TWO_STAGE_CONFIRM}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({
  label,
  unit,
  ceiling,
  value,
  step,
  decimal,
  onChange,
}: {
  label: string
  unit: string
  ceiling: string
  value: number
  step: number
  decimal?: boolean
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-baseline justify-between text-xs uppercase tracking-wide text-ink-tertiary">
        <span>{label}</span>
        <span className="font-mono text-[0.65rem] text-ink-tertiary">ceiling {ceiling}</span>
      </Label>
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
          className="font-mono"
        />
        <span className="text-sm text-ink-tertiary">{unit}</span>
      </div>
    </div>
  )
}

function Diff({ label, before, after }: { label: string; before: string; after: string }) {
  const changed = before !== after
  return (
    <div className="flex items-baseline justify-between border-b border-line-subtle py-1 text-xs">
      <span className="text-ink-tertiary">{label}</span>
      <span className="font-mono">
        <span className={changed ? 'text-ink-tertiary line-through' : 'text-ink-secondary'}>
          {before}
        </span>
        {changed ? <span className="mx-2 text-ink-tertiary">→</span> : null}
        {changed ? <span className="text-amber-200">{after}</span> : null}
      </span>
    </div>
  )
}
