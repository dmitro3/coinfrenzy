import * as React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { cn } from '../../lib/utils'

export interface StatCardProps {
  label: string
  value: React.ReactNode
  unit?: string
  /** Delta vs. previous period in percent (e.g. 0.12 for +12%). null = no delta. */
  deltaPct?: number | null
  /** Sub-label shown below the value (e.g. "vs yesterday"). */
  sublabel?: string
  /** When false, render a skeleton in place of the value. */
  loading?: boolean
  className?: string
  /** Optional icon shown top-right. Used sparingly — only when functional. */
  icon?: React.ReactNode
}

/**
 * Legacy stat tile (docs/08 §2 top row). Restyled to match the new visual
 * system — no uppercase labels, lighter borders, more breathing room. New
 * pages should prefer `StatTile`, which exposes a richer API (sparkline,
 * delta object, href).
 */
export function StatCard({
  label,
  value,
  unit,
  deltaPct,
  sublabel,
  loading,
  className,
  icon,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-secondary">{label}</span>
        {icon ? <span className="text-ink-tertiary">{icon}</span> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        {loading ? (
          <span className="my-0.5 inline-block h-8 w-24 animate-pulse-soft rounded-sm bg-elevated" />
        ) : (
          <>
            <span className="text-3xl font-semibold tracking-tight text-ink-primary">{value}</span>
            {unit ? <span className="text-md font-medium text-ink-tertiary">{unit}</span> : null}
          </>
        )}
      </div>
      <DeltaOrSublabel deltaPct={deltaPct ?? null} sublabel={sublabel} />
    </div>
  )
}

export function DeltaOrSublabel({
  deltaPct,
  sublabel,
}: {
  deltaPct: number | null
  sublabel?: string
}) {
  if (deltaPct == null) {
    return sublabel ? (
      <span className="text-xs text-ink-tertiary">{sublabel}</span>
    ) : (
      <span className="text-xs text-ink-tertiary">&nbsp;</span>
    )
  }
  const positive = deltaPct >= 0
  const Icon = positive ? ArrowUp : ArrowDown
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium',
          positive ? 'text-positive' : 'text-critical',
        )}
      >
        <Icon className="h-3 w-3" />
        {(Math.abs(deltaPct) * 100).toFixed(1)}%
      </span>
      {sublabel ? <span className="text-ink-tertiary">{sublabel}</span> : null}
    </div>
  )
}
