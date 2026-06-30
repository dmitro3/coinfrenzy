import * as React from 'react'
import { User } from 'lucide-react'

import { cn } from '../../lib/utils'

// M4 — host badge. Inline chip showing which host owns a VIP. Falls back
// to a neutral "Unassigned" tag when no host is set.

interface HostBadgeProps {
  host: { id: string; displayName: string } | null
  /** Optional render-prop so each app can route to its own host detail link. */
  renderLink?: (props: { href: string; children: React.ReactNode }) => React.ReactNode
  /** Override the href derived from the host id (default: /admin/vip/hosts/:id). */
  hrefFor?: (hostId: string) => string
  className?: string
}

export function HostBadge({ host, renderLink, hrefFor, className }: HostBadgeProps) {
  if (!host) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm bg-elevated px-2 py-0.5 text-xs font-medium text-ink-tertiary',
          className,
        )}
      >
        <User className="h-3.5 w-3.5" />
        Unassigned
      </span>
    )
  }
  const initials = initialsFor(host.displayName)
  const body = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm bg-surface-hover px-2 py-0.5 text-xs font-medium text-ink-secondary hover:text-ink-primary',
        className,
      )}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
        {initials}
      </span>
      {host.displayName}
    </span>
  )
  const href = hrefFor ? hrefFor(host.id) : `/admin/vip/hosts/${host.id}`
  if (renderLink) return <>{renderLink({ href, children: body })}</>
  return body
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}
