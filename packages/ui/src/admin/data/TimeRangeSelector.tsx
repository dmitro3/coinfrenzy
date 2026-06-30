'use client'

import * as React from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'

import {
  DASHBOARD_RANGE_PRESETS,
  type DashboardRange,
  type DashboardRangePreset,
  MAX_CUSTOM_RANGE_DAYS,
  PRESET_LABELS,
  toIsoDate,
} from '@coinfrenzy/config'

import { cn } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu'

interface TimeRangeSelectorProps {
  value: DashboardRange
  onChange: (next: DashboardRange) => void
  /**
   * The presets shown directly in the chip strip. The remaining presets
   * collapse into the "More" dropdown. Defaults match the dashboard prompt.
   */
  inlinePresets?: DashboardRangePreset[]
  className?: string
}

const DEFAULT_INLINE: DashboardRangePreset[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'last_month',
  'year_to_date',
  'last_year',
  'last_12_months',
  'all_time',
]

/**
 * Chip-style time range selector for dashboard headers (item 1 of pre-M3
 * polish). Presets render inline; less common ranges live in a "More"
 * dropdown; "Custom…" opens a small from/to date picker dialog.
 */
export function TimeRangeSelector({
  value,
  onChange,
  inlinePresets = DEFAULT_INLINE,
  className,
}: TimeRangeSelectorProps) {
  const overflowPresets = React.useMemo(
    () => DASHBOARD_RANGE_PRESETS.filter((p) => !inlinePresets.includes(p)),
    [inlinePresets],
  )
  const [customOpen, setCustomOpen] = React.useState(false)

  const activePresetKey = value.kind === 'custom' ? null : value.kind
  const customLabel =
    value.kind === 'custom'
      ? `${formatShortIso(value.fromIso)} – ${formatShortIso(value.toIso)}`
      : null

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {inlinePresets.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={activePresetKey === preset}
          onClick={() => onChange({ kind: preset })}
          className={chipClass(activePresetKey === preset)}
        >
          {PRESET_LABELS[preset]}
        </button>
      ))}

      {overflowPresets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={chipClass(
                activePresetKey != null && overflowPresets.includes(activePresetKey),
              )}
            >
              {activePresetKey && overflowPresets.includes(activePresetKey)
                ? PRESET_LABELS[activePresetKey]
                : 'More'}
              <ChevronDown className="ml-1 h-3.5 w-3.5 text-ink-tertiary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Time range</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {overflowPresets.map((preset) => (
              <DropdownMenuItem key={preset} onSelect={() => onChange({ kind: preset })}>
                {PRESET_LABELS[preset]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <button
        type="button"
        aria-pressed={value.kind === 'custom'}
        onClick={() => setCustomOpen(true)}
        className={cn(chipClass(value.kind === 'custom'), 'gap-1.5')}
      >
        <Calendar className="h-3.5 w-3.5" />
        {customLabel ?? 'Custom…'}
      </button>

      {customOpen ? (
        <CustomRangeDialog
          initial={value.kind === 'custom' ? { from: value.fromIso, to: value.toIso } : null}
          onClose={() => setCustomOpen(false)}
          onApply={(from, to) => {
            onChange({ kind: 'custom', fromIso: from, toIso: to })
            setCustomOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function chipClass(active: boolean): string {
  return cn(
    'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
    active
      ? 'border border-line-default bg-elevated text-ink-primary shadow-sm'
      : 'border border-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink-primary',
  )
}

function formatShortIso(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function CustomRangeDialog({
  initial,
  onClose,
  onApply,
}: {
  initial: { from: string; to: string } | null
  onClose: () => void
  onApply: (from: string, to: string) => void
}) {
  const today = toIsoDate(new Date())
  const [from, setFrom] = React.useState(initial?.from ?? today)
  const [to, setTo] = React.useState(initial?.to ?? today)
  const [error, setError] = React.useState<string | null>(null)

  function apply() {
    setError(null)
    if (!from || !to) {
      setError('Pick both a start and end date.')
      return
    }
    if (from > to) {
      setError('Start date must be before or equal to end date.')
      return
    }
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
    if (days > MAX_CUSTOM_RANGE_DAYS) {
      setError(`Range can be at most ${MAX_CUSTOM_RANGE_DAYS} days.`)
      return
    }
    onApply(from, to)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick custom date range"
        className="w-full max-w-md rounded-lg border border-line-default bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">Custom range</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Pick a window up to {MAX_CUSTOM_RANGE_DAYS} days. Both bounds are UTC.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-ink-tertiary hover:bg-surface-hover hover:text-ink-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-secondary">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-line-default bg-base px-3 text-sm text-ink-primary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-secondary">To</span>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-line-default bg-base px-3 text-sm text-ink-primary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-line-default bg-base px-3 text-sm font-medium text-ink-primary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-base hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
