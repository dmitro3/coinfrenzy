import * as React from 'react'

import { cn } from '../../lib/utils'

import { QuickInsights, type QuickInsight } from '../cards/QuickInsights'

import { PageHeader, type PageHeaderBreadcrumb } from './PageHeader'

interface ListPageShellProps {
  title: string
  subtitle?: string
  description?: string
  breadcrumb?: PageHeaderBreadcrumb[]
  /** Top-right slot for primary action (e.g. "+ New"). */
  actions?: React.ReactNode
  /** 3–5 quick-insight tiles answering "what matters here right now". */
  insights?: QuickInsight[]
  /**
   * Render-prop forwarded to PageHeader for breadcrumb links. PageHeader
   * is a server component so this is a server→server prop pass — safe.
   * NB: This is intentionally NOT forwarded to QuickInsights because that
   * is a client component and Next.js forbids passing functions across
   * the server→client boundary.
   */
  renderLink?: (props: { href: string; children: React.ReactNode }) => React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * Standard list-page chrome used across every admin list view.
 *
 * Layout (top → bottom):
 *   1. Breadcrumb + title + actions  (PageHeader)
 *   2. Insight strip                  (QuickInsights, optional)
 *   3. Page body (filters, table, etc) provided as children
 *
 * Pages should still place their FilterBar and DataTable inside `children`
 * so they keep full control over filter wiring.
 */
export function ListPageShell({
  title,
  subtitle,
  description,
  breadcrumb,
  actions,
  insights,
  renderLink,
  className,
  children,
}: ListPageShellProps) {
  return (
    <div className={cn('space-y-6 px-8 py-8', className)}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        description={description}
        breadcrumb={breadcrumb}
        actions={actions}
        renderLink={renderLink}
      />
      {insights && insights.length > 0 ? <QuickInsights insights={insights} /> : null}
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  )
}
