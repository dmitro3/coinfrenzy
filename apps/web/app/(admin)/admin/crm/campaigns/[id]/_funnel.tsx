'use client'

import { cn } from '@coinfrenzy/ui/lib/utils'

interface Stage {
  label: string
  value: number
}

interface Props {
  stages: Stage[]
  className?: string
}

const FUNNEL_COLORS = [
  'bg-violet-500/80',
  'bg-violet-500/70',
  'bg-violet-500/60',
  'bg-emerald-500/70',
  'bg-emerald-500/60',
  'bg-emerald-400/70',
] as const

export function CampaignFunnel({ stages, className }: Props) {
  const top = stages[0]?.value ?? 0
  if (top === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-subtle bg-surface p-8 text-center text-sm text-ink-tertiary">
        No funnel data yet.
      </div>
    )
  }
  return (
    <div className={cn('space-y-2', className)}>
      {stages.map((s, i) => {
        const pct = (s.value / top) * 100
        const dropFromTop = top > 0 ? ((top - s.value) / top) * 100 : 0
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-ink-tertiary">
              {s.label}
            </span>
            <div className="relative flex-1 overflow-hidden rounded-md bg-surface-elevated">
              <div
                className={cn('h-9 transition-all', FUNNEL_COLORS[i] ?? 'bg-violet-500/60')}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
              <div className="absolute inset-y-0 left-3 flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-ink-primary">
                  {s.value.toLocaleString()}
                </span>
                <span className="text-xs text-ink-secondary">
                  ({pct.toFixed(1)}%{i > 0 ? ` · -${dropFromTop.toFixed(1)}% from top` : ''})
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
