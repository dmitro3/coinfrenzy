'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { cn } from '../../lib/utils'
import { ScrollArea } from '../../primitives/scroll-area'

import {
  type AdminRoleSlug,
  type NavGroup,
  type NavLeaf,
  type NavNode,
  navForRole,
} from './nav-config'

interface AdminSidebarProps {
  role: AdminRoleSlug | null
  pathname: string
  /** Render prop for app-specific Link wrapper (Next.js, React Router, etc.) */
  renderLink: (props: {
    href: string
    children: React.ReactNode
    className?: string
  }) => React.ReactNode
  footer?: React.ReactNode
}

export function AdminSidebar({ role, pathname, renderLink, footer }: AdminSidebarProps) {
  const items = React.useMemo(() => navForRole(role), [role])

  return (
    <aside
      className="flex h-full min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r border-line-subtle bg-base"
      aria-label="Admin navigation"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-line-subtle px-5">
        <span aria-hidden="true" className="text-base font-black leading-none text-brand">
          ⬢
        </span>
        <span className="text-md font-semibold tracking-tight text-ink-primary">CoinFrenzy</span>
        <span className="ml-auto rounded-sm bg-elevated px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-ink-tertiary">
          admin
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-px p-2">
          {items.map((node, idx) => (
            <NavItem
              key={node.kind === 'leaf' ? node.href : `group-${node.label}-${idx}`}
              node={node}
              pathname={pathname}
              renderLink={renderLink}
            />
          ))}
        </nav>
      </ScrollArea>

      {footer ? <div className="border-t border-line-subtle p-3">{footer}</div> : null}
    </aside>
  )
}

interface NavItemProps {
  node: NavNode
  pathname: string
  renderLink: AdminSidebarProps['renderLink']
}

function NavItem({ node, pathname, renderLink }: NavItemProps) {
  if (node.kind === 'leaf') {
    return <NavLeafItem leaf={node} pathname={pathname} renderLink={renderLink} />
  }
  return <NavGroupItem group={node} pathname={pathname} renderLink={renderLink} />
}

function NavLeafItem({
  leaf,
  pathname,
  renderLink,
  inset,
}: {
  leaf: NavLeaf
  pathname: string
  renderLink: AdminSidebarProps['renderLink']
  inset?: boolean
}) {
  const active =
    pathname === leaf.href || (leaf.href !== '/admin' && pathname.startsWith(leaf.href + '/'))
  const Icon = leaf.icon

  return (
    <>
      {renderLink({
        href: leaf.href,
        className: cn(
          'group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
          inset && 'pl-9',
          active
            ? 'bg-surface-hover font-medium text-ink-primary'
            : leaf.stub
              ? 'text-ink-disabled hover:bg-surface-hover hover:text-ink-secondary'
              : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary',
        ),
        children: (
          <>
            {Icon && !inset ? (
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? 'text-ink-primary' : 'text-ink-tertiary',
                )}
              />
            ) : null}
            <span className="truncate">{leaf.label}</span>
            {leaf.stub ? (
              <span className="ml-auto rounded-sm bg-elevated px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-ink-tertiary">
                soon
              </span>
            ) : null}
          </>
        ),
      })}
    </>
  )
}

function NavGroupItem({
  group,
  pathname,
  renderLink,
}: {
  group: NavGroup
  pathname: string
  renderLink: AdminSidebarProps['renderLink']
}) {
  const groupActive = group.children.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + '/'),
  )
  const [open, setOpen] = React.useState(groupActive)
  const Icon = group.icon
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div className="mt-2 flex flex-col first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex h-7 items-center gap-2.5 rounded-md px-2 transition-colors"
        aria-expanded={open}
      >
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" /> : null}
        <span className="truncate text-xs font-medium uppercase tracking-wider text-ink-tertiary">
          {group.label}
        </span>
        <Chevron className="ml-auto h-3 w-3 shrink-0 text-ink-tertiary" />
      </button>
      {open ? (
        <div className="mt-0.5 flex flex-col gap-px">
          {group.children.map((leaf) => (
            <NavLeafItem
              key={leaf.href}
              leaf={leaf}
              pathname={pathname}
              renderLink={renderLink}
              inset
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
