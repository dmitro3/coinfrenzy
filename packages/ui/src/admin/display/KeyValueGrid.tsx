import * as React from 'react'

import { cn } from '../../lib/utils'

export interface KeyValueItem {
  label: string
  value: React.ReactNode
}

interface KeyValueGridProps {
  items: KeyValueItem[]
  /** When 'horizontal', label and value sit side-by-side; when 'stacked', value drops below. */
  layout?: 'horizontal' | 'stacked'
  className?: string
}

/**
 * Read-only metadata grid. Used inside detail-page sidebar cards.
 */
export function KeyValueGrid({ items, layout = 'horizontal', className }: KeyValueGridProps) {
  return (
    <dl className={cn('flex flex-col gap-2', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            layout === 'horizontal'
              ? 'flex items-start justify-between gap-3'
              : 'flex flex-col gap-1',
          )}
        >
          <dt className="text-sm text-ink-secondary">{item.label}</dt>
          <dd
            className={cn(
              'text-sm text-ink-primary',
              layout === 'horizontal' && 'text-right tabular-nums',
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
