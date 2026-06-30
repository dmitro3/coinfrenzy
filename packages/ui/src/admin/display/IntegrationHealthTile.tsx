import * as React from 'react'

import { cn } from '../../lib/utils'

export type IntegrationHealthState = 'green' | 'yellow' | 'red' | 'unknown' | 'mock'

export interface IntegrationHealthTileProps {
  name: string
  state: IntegrationHealthState
  /** ISO string of last successful event. */
  lastSeenAt?: string | null
  errorCount1h?: number
}

const stateMeta: Record<IntegrationHealthState, { dot: string; label: string; labelCls: string }> =
  {
    green: { dot: 'bg-success', label: 'Healthy', labelCls: 'text-success' },
    yellow: { dot: 'bg-warning', label: 'Degraded', labelCls: 'text-warning' },
    red: { dot: 'bg-destructive', label: 'Down', labelCls: 'text-destructive' },
    unknown: { dot: 'bg-muted-foreground', label: 'Unknown', labelCls: 'text-muted-foreground' },
    mock: { dot: 'bg-amber-500', label: 'Mock Mode', labelCls: 'text-amber-600' },
  }

export function IntegrationHealthTile({
  name,
  state,
  lastSeenAt,
  errorCount1h = 0,
}: IntegrationHealthTileProps) {
  const meta = stateMeta[state]
  const lastSeenLabel = lastSeenAt ? formatRelative(lastSeenAt) : 'never'

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card/60 px-3 py-2">
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          meta.dot,
          (state === 'green' || state === 'mock') && 'animate-pulse',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className={cn('font-mono text-[10px] uppercase tracking-wider', meta.labelCls)}>
            {meta.label}
          </span>
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span>last: {lastSeenLabel}</span>
          {errorCount1h > 0 ? (
            <span className="text-destructive">{errorCount1h} err/1h</span>
          ) : (
            <span>0 err/1h</span>
          )}
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'never'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}
