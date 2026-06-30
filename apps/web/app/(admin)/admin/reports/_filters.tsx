'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Calendar, Download, RotateCcw } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'

import { presetRange, PRESET_OPTIONS, type ReportPreset } from './_shared.client'

interface DateRangeFilterProps {
  from: string
  to: string
  fallbackFrom: string
  fallbackTo: string
  /** Optional CSV export endpoint. If provided, an "Export CSV" button is rendered. */
  exportHref?: string
}

/**
 * Date-range filter used across every report page. Combines:
 *   - Quick presets (7d / 30d / 90d / 180d / 1y / MTD / Last month / YTD / All time)
 *   - Manual From/To inputs
 *   - Apply / Reset
 *   - Optional Export CSV link (preserves current search params)
 *
 * All filter changes route through Next.js `router.push` so the page can
 * re-render server-side with the new params. We do not query the API for
 * filter previews — Reports load fresh on every navigation.
 */
export function DateRangeFilter({
  from,
  to,
  fallbackFrom,
  fallbackTo,
  exportHref,
}: DateRangeFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [localFrom, setLocalFrom] = React.useState(from)
  const [localTo, setLocalTo] = React.useState(to)

  React.useEffect(() => {
    setLocalFrom(from)
    setLocalTo(to)
  }, [from, to])

  function apply(nextFrom = localFrom, nextTo = localTo) {
    const next = new URLSearchParams(params.toString())
    next.set('from', nextFrom || fallbackFrom)
    next.set('to', nextTo || fallbackTo)
    router.push(`${pathname}?${next.toString()}`)
  }

  function applyPreset(preset: ReportPreset) {
    const range = presetRange(preset)
    setLocalFrom(range.from)
    setLocalTo(range.to)
    apply(range.from, range.to)
  }

  function reset() {
    setLocalFrom(fallbackFrom)
    setLocalTo(fallbackTo)
    router.push(pathname)
  }

  const activePreset = detectActivePreset({ from: localFrom, to: localTo })
  const fullExportHref = buildExportHref(exportHref, localFrom, localTo, params)

  return (
    <div className="space-y-3 rounded-lg border border-line-subtle bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
          Range
        </span>
        {PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => applyPreset(opt.id)}
            className={
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ' +
              (activePreset === opt.id
                ? 'border-line-default bg-elevated text-ink-primary'
                : 'border-line-subtle text-ink-secondary hover:border-line-default hover:text-ink-primary')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-tertiary">From</span>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <Input
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="h-9 w-44 pl-7 text-sm"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-tertiary">To</span>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <Input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="h-9 w-44 pl-7 text-sm"
            />
          </div>
        </label>
        <Button onClick={() => apply()} size="sm" className="h-9">
          Apply
        </Button>
        <Button onClick={reset} variant="outline" size="sm" className="h-9">
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
        <div className="ml-auto">
          {fullExportHref ? (
            <a href={fullExportHref}>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface ExportOnlyProps {
  exportHref: string
}

/** Lightweight Export-only button for reports without date filters. */
export function ReportExportBar({ exportHref }: ExportOnlyProps) {
  const params = useSearchParams()
  const href = appendParams(exportHref, params)
  return (
    <div className="flex justify-end">
      <a href={href}>
        <Button variant="outline" size="sm" className="h-9">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </a>
    </div>
  )
}

function buildExportHref(
  base: string | undefined,
  from: string,
  to: string,
  params: URLSearchParams,
): string | null {
  if (!base) return null
  const merged = new URLSearchParams(params.toString())
  if (from) merged.set('from', from)
  if (to) merged.set('to', to)
  const qs = merged.toString()
  return qs ? `${base}?${qs}` : base
}

function appendParams(base: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

function detectActivePreset(range: { from: string; to: string }): ReportPreset | null {
  for (const opt of PRESET_OPTIONS) {
    const r = presetRange(opt.id)
    if (r.from === range.from && r.to === range.to) return opt.id
  }
  return null
}
