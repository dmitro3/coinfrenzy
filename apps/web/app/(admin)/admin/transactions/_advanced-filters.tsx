'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Input } from '@coinfrenzy/ui/primitives/input'

import { TransactionsExportButton } from './_export-button'

interface Props {
  /** ISO 'YYYY-MM-DD' (or empty). */
  initialFrom: string
  initialTo: string
  initialMin: string
  initialMax: string
  /** Amount-input label — typically "USD" or "SC". */
  amountUnit: 'USD' | 'SC' | 'GC'
  exportHref: string
}

/**
 * Second-row filter strip used by every transactions list view. Pairs with
 * the FilterBar (which provides search + quick presets + dropdowns) and adds
 * the controls operators reach for most often when reviewing historical
 * activity:
 *   - explicit From / To dates (when quick presets aren't enough)
 *   - amount range (find that one big-ticket transaction fast)
 *   - one-click CSV export of the current filtered view
 */
export function TransactionsAdvancedFilters({
  initialFrom,
  initialTo,
  initialMin,
  initialMax,
  amountUnit,
  exportHref,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [from, setFrom] = React.useState(initialFrom)
  const [to, setTo] = React.useState(initialTo)
  const [min, setMin] = React.useState(initialMin)
  const [max, setMax] = React.useState(initialMax)

  React.useEffect(() => {
    setFrom(initialFrom)
    setTo(initialTo)
    setMin(initialMin)
    setMax(initialMax)
  }, [initialFrom, initialTo, initialMin, initialMax])

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key)
      else next.set(key, value)
    }
    // Choosing an explicit date overrides any "quick" preset — drop quick so
    // operators don't get surprised by stale URL state.
    if (patch.from !== undefined || patch.to !== undefined) {
      next.delete('quick')
    }
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const applyDates = () => update({ from: from || null, to: to || null })
  const applyAmounts = () => update({ min: min || null, max: max || null })
  const clearDates = () => {
    setFrom('')
    setTo('')
    update({ from: null, to: null })
  }
  const clearAmounts = () => {
    setMin('')
    setMax('')
    update({ min: null, max: null })
  }

  const hasDates = initialFrom !== '' || initialTo !== ''
  const hasAmounts = initialMin !== '' || initialMax !== ''

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-line-subtle bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
          Date range
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          To
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={applyDates}
          className="inline-flex h-8 items-center rounded-md border border-line-subtle bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-line-default hover:text-ink-primary"
        >
          Apply
        </button>
        {hasDates ? (
          <button
            type="button"
            onClick={clearDates}
            className="inline-flex h-8 items-center rounded-md px-2 text-xs text-ink-tertiary hover:text-ink-primary"
          >
            Clear dates
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:border-l sm:border-line-subtle sm:pl-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
          Amount ({amountUnit})
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          Min
          <Input
            type="number"
            min={0}
            step="0.01"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="0.00"
            className="h-8 w-24 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          Max
          <Input
            type="number"
            min={0}
            step="0.01"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="∞"
            className="h-8 w-24 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={applyAmounts}
          className="inline-flex h-8 items-center rounded-md border border-line-subtle bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-line-default hover:text-ink-primary"
        >
          Apply
        </button>
        {hasAmounts ? (
          <button
            type="button"
            onClick={clearAmounts}
            className="inline-flex h-8 items-center rounded-md px-2 text-xs text-ink-tertiary hover:text-ink-primary"
          >
            Clear amount
          </button>
        ) : null}
      </div>

      <div className="ml-auto">
        <TransactionsExportButton href={exportHref} />
      </div>
    </div>
  )
}
