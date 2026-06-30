'use client'

import * as React from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

import { cn } from '../../lib/utils'
import { DeltaOrSublabel } from './StatCard'

export interface StatCardWithTrendProps {
  label: string
  value: React.ReactNode
  unit?: string
  deltaPct?: number | null
  sublabel?: string
  loading?: boolean
  /** Series of values to render as a sparkline. */
  series: Array<{ x: string | number; y: number }>
  /** Hex/oklch color for the sparkline (default: brand gold). */
  sparkColor?: string
  className?: string
}

export function StatCardWithTrend({
  label,
  value,
  unit,
  deltaPct,
  sublabel,
  loading,
  series,
  sparkColor = 'hsl(var(--color-accent))',
  className,
}: StatCardWithTrendProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface p-5',
        className,
      )}
    >
      <span className="text-sm font-medium text-ink-secondary">{label}</span>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          {loading ? (
            <span className="my-0.5 inline-block h-8 w-24 animate-pulse-soft rounded-sm bg-elevated" />
          ) : (
            <>
              <span className="text-3xl font-semibold tracking-tight text-ink-primary">
                {value}
              </span>
              {unit ? <span className="text-md font-medium text-ink-tertiary">{unit}</span> : null}
            </>
          )}
        </div>
        <div className="h-10 w-24 shrink-0">
          {series.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient
                    id={`spark-${label.replace(/\s+/g, '-')}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={sparkColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="y"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  fill={`url(#spark-${label.replace(/\s+/g, '-')})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <span className="text-xs text-ink-tertiary">no data</span>
          )}
        </div>
      </div>
      <DeltaOrSublabel deltaPct={deltaPct ?? null} sublabel={sublabel} />
    </div>
  )
}
