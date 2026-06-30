'use client'

import * as React from 'react'

import { cn } from '../../lib/utils'

export type QuickInsightTone = 'positive' | 'attention' | 'critical' | 'notice' | 'neutral'

export interface QuickInsight {
  label: string
  value: React.ReactNode
  /** Subline placed beneath the value. Coloured by tone. */
  delta?: React.ReactNode
  tone?: QuickInsightTone
  /**
   * Optional URL — clicking the tile navigates here. Rendered as a plain
   * `<a>` tag; we deliberately do NOT accept a render-prop for the link
   * because QuickInsights is a client component and Next.js App Router
   * forbids passing functions across the server→client boundary.
   * Insight tiles aren't a hot navigation path, so a full-page nav is
   * acceptable.
   */
  href?: string
  /** Optional leading icon — keep small. */
  icon?: React.ReactNode
}

interface QuickInsightsProps {
  insights: QuickInsight[]
  className?: string
}

const TONE_TEXT: Record<QuickInsightTone, string> = {
  positive: 'text-positive',
  attention: 'text-attention',
  critical: 'text-critical',
  notice: 'text-notice',
  neutral: 'text-ink-tertiary',
}

/**
 * 3–5 tile horizontal strip placed at the TOP of every list page,
 * before filters. Answers "what matters here right now?" in two seconds.
 *
 * Each tile is intentionally calm — no charts, no shadows, no decorative
 * ornament. Density is tight; compact enough to fit five tiles on a
 * standard 1280-wide desktop without wrapping.
 */
export function QuickInsights({ insights, className }: QuickInsightsProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        insights.length <= 2 && 'sm:grid-cols-2',
        insights.length === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        insights.length === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        insights.length >= 5 && 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
        className,
      )}
    >
      {insights.map((insight, idx) => (
        <Tile key={`${insight.label}-${idx}`} insight={insight} />
      ))}
    </div>
  )
}

function Tile({ insight }: { insight: QuickInsight }) {
  const tone = insight.tone ?? 'neutral'
  const isLink = Boolean(insight.href)
  // Auto-shrink the value if its rendered string is long. Same logic as
  // StatTile so lifetime counters with 6+ digit values never burst out
  // of the card on heavy players.
  const valueLen = typeof insight.value === 'string' ? insight.value.length : 0
  const sizeCls =
    valueLen <= 8
      ? 'text-2xl'
      : valueLen <= 12
        ? 'text-xl'
        : valueLen <= 16
          ? 'text-lg'
          : 'text-base'
  const valueTitle = typeof insight.value === 'string' ? insight.value : undefined
  const body = (
    <div
      className={cn(
        'flex min-h-[88px] flex-col justify-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-4 py-3 transition-colors',
        isLink && 'cursor-pointer hover:border-line-default hover:bg-surface-hover',
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
        {insight.icon ? (
          <span className="text-ink-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">{insight.icon}</span>
        ) : null}
        <span className="truncate">{insight.label}</span>
      </div>
      <div
        className={cn(
          'min-w-0 truncate font-semibold tabular-nums tracking-tight text-ink-primary',
          sizeCls,
        )}
        title={valueTitle}
      >
        {insight.value}
      </div>
      {insight.delta ? (
        <div className={cn('truncate text-xs tabular-nums', TONE_TEXT[tone])}>{insight.delta}</div>
      ) : (
        <div className="h-4" aria-hidden="true" />
      )}
    </div>
  )

  if (insight.href) {
    return (
      <a href={insight.href} className="block">
        {body}
      </a>
    )
  }
  return body
}
