'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'

import { AdminTopBar, AdminUserMenu, HostSidebar } from '@coinfrenzy/ui/admin'

interface HostShellProps {
  admin: { id: string; email: string; displayName: string; role: string }
  children: React.ReactNode
}

export function HostShell({ admin, children }: HostShellProps) {
  const pathname = usePathname() ?? '/admin'
  const router = useRouter()
  const searchParams = useSearchParams()
  const restricted = searchParams?.get('restricted') === '1'
  const from = searchParams?.get('from')
  const [restrictedBanner, setRestrictedBanner] = React.useState(restricted)

  React.useEffect(() => {
    setRestrictedBanner(restricted)
  }, [restricted])

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }

  return (
    <>
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <HostSidebar
          pathname={pathname}
          renderLink={({ href, children: linkChildren, className }) => (
            <Link href={href} className={className}>
              {linkChildren}
            </Link>
          )}
          footer={
            <div className="flex flex-col gap-0.5 px-2 py-1 text-xs">
              <span className="font-medium text-ink-secondary">{admin.displayName}</span>
              <span className="text-ink-tertiary">{admin.email}</span>
            </div>
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AdminTopBar
            breadcrumbs={breadcrumbsFromPath(pathname)}
            realtimeState="connected"
            renderLink={({ href, children: linkChildren }) => (
              <Link href={href}>{linkChildren}</Link>
            )}
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
          {restrictedBanner ? (
            <RestrictedBanner from={from} onDismiss={() => setRestrictedBanner(false)} />
          ) : null}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>
        </div>
      </div>
    </>
  )
}

function RestrictedBanner({ from, onDismiss }: { from: string | null; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-attention/30 bg-attention-bg px-6 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-attention" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-attention">Access restricted</p>
        <p className="mt-0.5 text-ink-secondary">
          The host portal is limited to your assigned VIPs.{' '}
          {from ? <code className="text-xs text-ink-tertiary">{from}</code> : null} is reserved for
          full admin accounts.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-1 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function breadcrumbsFromPath(pathname: string): { label: string; href?: string }[] {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (parts.length === 0 || parts[0] !== 'admin') return [{ label: 'Dashboard', href: '/admin' }]
  const crumbs: { label: string; href?: string }[] = [{ label: 'Host Portal', href: '/admin' }]
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
