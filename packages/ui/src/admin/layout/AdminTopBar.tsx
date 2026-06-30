'use client'

import * as React from 'react'
import { Bell, ChevronRight, Search, Wifi, WifiOff } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Input } from '../../primitives/input'

interface AdminTopBarProps {
  /** Breadcrumb path (e.g. ["Players", "Acme"]). */
  breadcrumbs?: { label: string; href?: string }[]
  realtimeState?: 'connected' | 'connecting' | 'disconnected'
  notificationCount?: number
  onSearchFocus?: () => void
  /** Render prop for app-specific Link wrapper. */
  renderLink?: (props: { href: string; children: React.ReactNode }) => React.ReactNode
  userMenu?: React.ReactNode
}

export function AdminTopBar({
  breadcrumbs,
  realtimeState = 'connecting',
  notificationCount = 0,
  onSearchFocus,
  renderLink,
  userMenu,
}: AdminTopBarProps) {
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isFormField = target && /^(input|textarea|select)$/i.test(target.tagName)
      if (e.key === '/' && !isFormField) {
        e.preventDefault()
        searchRef.current?.focus()
        onSearchFocus?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSearchFocus])

  return (
    <header className="flex h-14 items-center gap-4 border-b border-line-subtle bg-base px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          breadcrumbs.map((b, i) => {
            const last = i === breadcrumbs.length - 1
            const label = (
              <span
                className={cn(
                  'truncate',
                  last ? 'font-medium text-ink-primary' : 'text-ink-tertiary',
                )}
              >
                {b.label}
              </span>
            )
            return (
              <React.Fragment key={`${b.label}-${i}`}>
                {b.href && !last && renderLink
                  ? renderLink({ href: b.href, children: label })
                  : label}
                {!last ? <ChevronRight className="h-3 w-3 text-ink-disabled" /> : null}
              </React.Fragment>
            )
          })
        ) : (
          <span className="text-sm text-ink-tertiary">Dashboard</span>
        )}
      </nav>

      <div className="relative ml-auto w-80 max-w-full">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary"
          aria-hidden="true"
        />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search players, codes, txn id…"
          className="h-9 border-line-subtle bg-surface pl-9 pr-12 text-sm text-ink-primary placeholder:text-ink-tertiary hover:border-line-default focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none rounded border border-line-subtle bg-base px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-tertiary">
          /
        </kbd>
      </div>

      <RealtimeStatusIndicator state={realtimeState} />

      <button
        type="button"
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
      >
        <Bell className="h-4 w-4" />
        {notificationCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-xs font-medium text-white">
            {notificationCount > 99 ? '99+' : notificationCount}
          </span>
        ) : null}
      </button>

      {userMenu}
    </header>
  )
}

function RealtimeStatusIndicator({
  state,
}: {
  state: 'connected' | 'connecting' | 'disconnected'
}) {
  const meta = {
    connected: { label: 'Live', cls: 'text-positive', icon: Wifi },
    connecting: { label: 'Connecting', cls: 'text-attention animate-pulse-soft', icon: Wifi },
    disconnected: { label: 'Offline', cls: 'text-critical', icon: WifiOff },
  }[state]
  const Icon = meta.icon
  return (
    <div className={cn('hidden items-center gap-1.5 text-sm lg:inline-flex', meta.cls)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium uppercase tracking-wider">{meta.label}</span>
    </div>
  )
}
