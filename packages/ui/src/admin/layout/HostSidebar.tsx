'use client'

import * as React from 'react'
import { Gift, LayoutDashboard, MessageSquare, UserCircle, Users } from 'lucide-react'

import { cn } from '../../lib/utils'
import { ScrollArea } from '../../primitives/scroll-area'

// M4 — Host portal sidebar.
//
// Hosts log into the same /admin/login URL as other admins, but their
// shell is intentionally NOT the regular AdminSidebar. This component
// renders a tiny four-link nav so the host portal feels like a
// self-contained product, not a stripped-down admin panel.

interface HostSidebarProps {
  pathname: string
  renderLink: (props: {
    href: string
    children: React.ReactNode
    className?: string
  }) => React.ReactNode
  footer?: React.ReactNode
}

interface HostNavLeaf {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const HOST_NAV: HostNavLeaf[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    description: 'Your VIP queue + activity',
  },
  {
    label: 'My VIPs',
    href: '/admin/vips',
    icon: Users,
    description: 'Players assigned to you',
  },
  {
    label: 'Send Bonus',
    href: '/admin/bonus',
    icon: Gift,
    description: 'Award bonuses to your VIPs',
  },
  {
    label: 'Messages',
    href: '/admin/messages',
    icon: MessageSquare,
    description: 'Email & SMS history',
  },
  {
    label: 'Account',
    href: '/admin/account',
    icon: UserCircle,
    description: 'Profile + logout',
  },
]

export function HostSidebar({ pathname, renderLink, footer }: HostSidebarProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r border-line-subtle bg-base"
      aria-label="Host portal navigation"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-line-subtle px-5">
        <span aria-hidden="true" className="text-base font-black leading-none text-brand">
          ⬢
        </span>
        <span className="text-md font-semibold tracking-tight text-ink-primary">CoinFrenzy</span>
        <span className="ml-auto rounded-sm bg-brand-bg px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-brand">
          host
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-px p-2">
          {HOST_NAV.map((leaf) => {
            const active =
              pathname === leaf.href ||
              (leaf.href !== '/admin' && pathname.startsWith(leaf.href + '/'))
            const Icon = leaf.icon
            return (
              <React.Fragment key={leaf.href}>
                {renderLink({
                  href: leaf.href,
                  className: cn(
                    'group flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                    active
                      ? 'bg-surface-hover font-medium text-ink-primary'
                      : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary',
                  ),
                  children: (
                    <>
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-ink-primary' : 'text-ink-tertiary',
                        )}
                      />
                      <span className="truncate">{leaf.label}</span>
                    </>
                  ),
                })}
              </React.Fragment>
            )
          })}
        </nav>

        <div className="border-t border-line-subtle px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
            Host Portal
          </p>
          <p className="mt-2 text-xs text-ink-secondary">
            Your VIPs trust you. Check in regularly, send thoughtful bonuses, and log every
            conversation.
          </p>
        </div>
      </ScrollArea>

      {footer ? <div className="border-t border-line-subtle p-3">{footer}</div> : null}
    </aside>
  )
}
