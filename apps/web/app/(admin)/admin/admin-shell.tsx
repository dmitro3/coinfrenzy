'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import {
  AdminSidebar,
  AdminTopBar,
  AdminUserMenu,
  CommandPalette,
  KeyboardShortcuts,
  type AdminRoleSlug,
} from '@coinfrenzy/ui/admin'

import { useRealtime } from './_realtime'

interface AdminShellProps {
  admin: { id: string; email: string; displayName: string; role: string }
  children: React.ReactNode
}

export function AdminShell({ admin, children }: AdminShellProps) {
  const pathname = usePathname() ?? '/admin'
  const router = useRouter()
  const realtime = useRealtime()
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }

  function navigate(href: string) {
    router.push(href)
  }

  return (
    <>
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <AdminSidebar
          role={admin.role as AdminRoleSlug}
          pathname={pathname}
          renderLink={({ href, children, className }) => (
            <Link href={href} className={className}>
              {children}
            </Link>
          )}
          footer={
            <div className="flex items-center gap-2 px-1 py-1 text-xs">
              <span className="text-muted-foreground">⌘K</span>
              <span className="text-muted-foreground">to search</span>
            </div>
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AdminTopBar
            breadcrumbs={breadcrumbsFromPath(pathname)}
            realtimeState={realtime.state}
            renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
            userMenu={
              <AdminUserMenu
                email={admin.email}
                displayName={admin.displayName}
                role={admin.role}
                onLogout={() => {
                  void logout()
                }}
              />
            }
          />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        role={admin.role as AdminRoleSlug}
        onNavigate={navigate}
        onLogout={() => void logout()}
      />
      <KeyboardShortcuts onOpenCommandPalette={() => setPaletteOpen(true)} onNavigate={navigate} />
    </>
  )
}

function breadcrumbsFromPath(pathname: string): { label: string; href?: string }[] {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (parts.length === 0 || parts[0] !== 'admin') return [{ label: 'Dashboard', href: '/admin' }]
  const crumbs: { label: string; href?: string }[] = [{ label: 'Dashboard', href: '/admin' }]
  let path = '/admin'
  for (let i = 1; i < parts.length; i++) {
    path += '/' + parts[i]
    crumbs.push({ label: prettyLabel(parts[i]!), href: i === parts.length - 1 ? undefined : path })
  }
  return crumbs
}

function prettyLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
