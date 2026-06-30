'use client'

import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { cn } from '../../lib/utils'

export interface StatTileDelta {
  /** Already-formatted percentage string (e.g. "+8.2%") or absolute value. */
  value: string
  trend: 'up' | 'down' | 'flat'
  /** Subtext after the delta (e.g. "vs yesterday"). */
  caption?: string
}

export type StatTileTone = 'neutral' | 'positive' | 'critical' | 'attention'

export interface StatTileProps {
  label: string
  value: React.ReactNode
  /** Optional unit appended to the value (small + muted). */
  unit?: string
  delta?: StatTileDelta
  /** Mini sparkline series. Numbers only — rendered with no axes/grid. */
  sparkline?: number[]
  /** When set, the entire tile becomes a link surface. */
  href?: string
  /** When true, tile renders a skeleton instead of value. */
  loading?: boolean
  /** Render prop for the host app's Link wrapper (Next.js, React Router, …). */
  renderLink?: (props: { href: string; children: React.ReactNode }) => React.ReactNode
  /**
   * Tints the primary value (not the label). Used to flash a net-position
   * tile red when the operator is down on a player, green when up.
   */
  valueTone?: StatTileTone
  /**
   * Optional fully-qualified value (with original precision) surfaced as a
   * tooltip when the rendered value is a compact / truncated string. Lets
   * us preserve precision even when the tile shrinks the display.
   */
  fullValue?: string
  className?: string
}

const VALUE_TONE: Record<StatTileTone, string> = {
  neutral: 'text-ink-primary',
  positive: 'text-positive',
  critical: 'text-critical',
  attention: 'text-attention',
}

/**
 * Stripe-style stat tile. The label sits on top, the value dominates, and
 * the delta-and-caption row anchors the bottom. An optional sparkline runs
 * the full width below.
 *
 * The component is intentionally calm — no heavy borders, no shadows,
 * no decorative icons. Hover lifts subtly when clickable.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  sparkline,
  href,
  loading,
  renderLink,
  valueTone = 'neutral',
  fullValue,
  className,
}: StatTileProps) {
  // Auto-shrink the value when the rendered string runs long. Avoids the
  // "31,317.( …" overflow on player tiles with multi-million $ lifetimes.
  const valueLen = typeof value === 'string' ? value.length : 0
  const sizeCls =
    valueLen <= 8
      ? 'text-3xl'
      : valueLen <= 12
        ? 'text-2xl'
        : valueLen <= 16
          ? 'text-xl'
          : 'text-lg'
  const tileBody = (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface p-5 transition-colors',
        href && 'cursor-pointer hover:bg-surface-hover',
        className,
      )}
    >
      <div className="truncate text-sm font-medium text-ink-secondary">{label}</div>

      <div className="flex min-w-0 items-baseline gap-1.5">
        {loading ? (
          <span className="my-1 inline-block h-8 w-32 animate-pulse-soft rounded-sm bg-elevated" />
        ) : (
          <>
            <span
              className={cn(
                'min-w-0 truncate font-semibold tabular-nums tracking-tight',
                sizeCls,
                VALUE_TONE[valueTone],
              )}
              title={fullValue ?? (typeof value === 'string' ? value : undefined)}
            >
              {value}
            </span>
            {unit ? (
              <span className="shrink-0 text-md font-medium text-ink-tertiary">{unit}</span>
            ) : null}
          </>
        )}
      </div>

      <DeltaRow delta={delta} />

      {sparkline && sparkline.length > 1 ? (
        <Sparkline values={sparkline} positive={delta?.trend !== 'down'} />
      ) : null}
    </div>
  )

  if (href && renderLink) {
    return <>{renderLink({ href, children: tileBody })}</>
  }
  if (href) {
    return (
      <a href={href} className="block">
        {tileBody}
      </a>
    )
  }
  return tileBody
}

function DeltaRow({ delta }: { delta?: StatTileDelta }) {
  if (!delta) {
    return <div className="h-4" aria-hidden="true" />
  }
  const Icon = delta.trend === 'up' ? ArrowUpRight : delta.trend === 'down' ? ArrowDownRight : Minus
  const colorCls =
    delta.trend === 'up'
      ? 'text-positive'
      : delta.trend === 'down'
        ? 'text-critical'
        : 'text-ink-tertiary'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('inline-flex items-center gap-0.5 font-medium', colorCls)}>
        <Icon className="h-3 w-3" />
        {delta.value}
      </span>
      {delta.caption ? <span className="text-ink-tertiary">{delta.caption}</span> : null}
    </div>
  )
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  // Compact, viewBox-based polyline. No axes, no grid — pure trend hint.
  // Using viewBox + preserveAspectRatio so the path scales with width.
  const w = 200
  const h = 40
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = w / Math.max(values.length - 1, 1)
  const points = values
    .map((v, i) => {
      const x = i * stepX
      const y = h - ((v - min) / range) * h
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const stroke = positive ? 'hsl(var(--color-success))' : 'hsl(var(--color-error))'

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-1 h-10 w-full"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </svg>
  )
}
