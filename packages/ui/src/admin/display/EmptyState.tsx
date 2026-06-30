import * as React from 'react'

import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Centered empty-state. Used when a list/table has zero rows for the current
 * filters, or when an entity hasn't been populated yet.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {icon ? (
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-elevated text-ink-tertiary">
          <span className="[&>svg]:h-12 [&>svg]:w-12">{icon}</span>
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-ink-primary">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
