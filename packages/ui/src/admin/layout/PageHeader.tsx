import * as React from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '../../lib/utils'

export interface PageHeaderBreadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  /** Inline secondary text rendered next to the title (e.g. "42,318 players"). */
  subtitle?: string
  /**
   * Long-form description shown below the title row. Kept for backwards
   * compatibility with existing pages — new pages should prefer `subtitle`.
   */
  description?: string
  breadcrumb?: PageHeaderBreadcrumb[]
  /** Top-right slot for primary actions (Add, Filter, etc.). */
  actions?: React.ReactNode
  className?: string
  /** Render prop so each app's Link wrapper can be used for breadcrumb hrefs. */
  renderLink?: (props: { href: string; children: React.ReactNode }) => React.ReactNode
}

/**
 * Stripe/Linear-inspired page header.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Admin / Players                                           │  ← breadcrumb (xs)
 *   │ Players  ·  42,318 total players              [Action]    │  ← title row
 *   └──────────────────────────────────────────────────────────┘
 *   32px vertical margin below.
 */
export function PageHeader({
  title,
  subtitle,
  description,
  breadcrumb,
  actions,
  className,
  renderLink,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-8', className)}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm">
          {breadcrumb.map((b, i) => {
            const last = i === breadcrumb.length - 1
            const inner = (
              <span
                className={cn(
                  'truncate',
                  last ? 'text-ink-secondary' : 'text-ink-tertiary hover:text-ink-secondary',
                )}
              >
                {b.label}
              </span>
            )
            return (
              <React.Fragment key={`${b.label}-${i}`}>
                {b.href && !last && renderLink
                  ? renderLink({ href: b.href, children: inner })
                  : inner}
                {!last ? <ChevronRight className="h-3 w-3 text-ink-disabled" /> : null}
              </React.Fragment>
            )
          })}
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-primary">
            {title}
          </h1>
          {subtitle ? (
            <span className="hidden truncate text-sm text-ink-secondary sm:inline">{subtitle}</span>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {description ? (
        <p className="mt-2 max-w-3xl text-sm text-ink-secondary">{description}</p>
      ) : null}
    </header>
  )
}

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('px-8 py-8', className)}>{children}</div>
}
