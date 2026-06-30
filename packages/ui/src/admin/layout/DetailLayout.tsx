import * as React from 'react'

import { cn } from '../../lib/utils'

interface DetailLayoutProps {
  /** Page-wide header (PageHeader) rendered above both columns. */
  header?: React.ReactNode
  /** Wide left column. */
  primary: React.ReactNode
  /** Narrower right column for stacked context cards. */
  sidebar: React.ReactNode
  className?: string
}

/**
 * Two-column detail layout (Stripe customer-detail style).
 *
 *  - On wide screens (≥xl): primary spans 8 of 12, sidebar spans 4
 *  - On narrower screens (<xl): sidebar drops below primary
 *  - Both columns scroll independently when overflowing
 */
export function DetailLayout({ header, primary, sidebar, className }: DetailLayoutProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {header}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">{primary}</div>
        <aside className="min-w-0 xl:col-span-4">
          <div className="flex flex-col gap-4">{sidebar}</div>
        </aside>
      </div>
    </div>
  )
}
