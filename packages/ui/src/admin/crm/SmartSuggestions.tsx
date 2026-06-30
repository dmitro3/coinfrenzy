'use client'

import * as React from 'react'
import { Sparkles, AlertCircle, TrendingUp, Info } from 'lucide-react'

import { cn } from '../../lib/utils'

export interface SmartSuggestion {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'attention' | 'critical'
}

interface SmartSuggestionsProps {
  suggestions: SmartSuggestion[]
  loading?: boolean
  className?: string
}

const TONE_RING: Record<NonNullable<SmartSuggestion['tone']>, string> = {
  neutral: 'border-line-subtle',
  positive: 'border-emerald-500/30',
  attention: 'border-amber-500/30',
  critical: 'border-rose-500/30',
}

const TONE_ICON: Record<
  NonNullable<SmartSuggestion['tone']>,
  React.ComponentType<{ className?: string }>
> = {
  neutral: Info,
  positive: TrendingUp,
  attention: AlertCircle,
  critical: AlertCircle,
}

const TONE_TEXT: Record<NonNullable<SmartSuggestion['tone']>, string> = {
  neutral: 'text-ink-tertiary',
  positive: 'text-emerald-400',
  attention: 'text-amber-400',
  critical: 'text-rose-400',
}

/**
 * Auto-generated insights about the current segment. Helps operators
 * validate the segment matches their intent ("Avg lifetime spend: $247
 * — that looks too low for a whale segment").
 */
export function SmartSuggestions({ suggestions, loading, className }: SmartSuggestionsProps) {
  return (
    <div className={cn('rounded-lg border border-line-subtle bg-surface', className)}>
      <div className="flex items-center gap-1.5 border-b border-line-subtle px-3 py-2 text-xs font-medium text-ink-secondary">
        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
        Smart suggestions
      </div>
      <div className="space-y-2 p-2">
        {loading && suggestions.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-ink-tertiary">Analysing…</div>
        ) : suggestions.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-ink-tertiary">
            Add at least one condition to see insights.
          </div>
        ) : (
          suggestions.map((s, i) => {
            const tone = s.tone ?? 'neutral'
            const Icon = TONE_ICON[tone]
            return (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-md border bg-elevated/40 px-2.5 py-2',
                  TONE_RING[tone],
                )}
              >
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TONE_TEXT[tone])} />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">
                    {s.label}
                  </div>
                  <div className="text-xs font-medium text-ink-primary">{s.value}</div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
