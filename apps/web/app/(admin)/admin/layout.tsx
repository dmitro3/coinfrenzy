import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { isHost, isHostAllowedAdminPath } from '@coinfrenzy/core/auth'

import { getAdminSession } from '@/lib/admin-session'
import { Providers } from './_providers'
import { AdminShell } from './admin-shell'
import { HostShell } from './host-shell'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession()
  if (!session) {
    redirect('/admin/login')
  }

  const role = session.payload.role
  const admin = {
    id: session.admin.id,
    email: session.admin.email,
    displayName: session.admin.displayName,
    role,
  }

  // Defense in depth — the edge middleware already redirects hosts away
  // from non-portal paths, but if anything slips through (rewrites, etc.)
  // we catch it here. Use x-pathname header set by middleware-friendly
  // helpers when available; otherwise headers() exposes the URL.
  if (isHost(role)) {
    const h = await headers()
    const pathname =
      h.get('x-invoke-path') ??
      h.get('x-pathname') ??
      h.get('next-url') ??
      // Fall back to parsing the referer when above are missing in some envs.
      parsePathFromUrl(h.get('referer'))
    if (pathname && !isHostAllowedAdminPath(pathname)) {
      const target = `/admin?restricted=1&from=${encodeURIComponent(pathname)}`
      redirect(target)
    }
  }

  return (
    <div className="dark admin-surface fixed inset-0 z-0 flex min-h-0 overflow-hidden text-foreground">
      <Providers admin={admin}>
        {isHost(role) ? (
          <HostShell admin={admin}>{children}</HostShell>
        ) : (
          <AdminShell admin={admin}>{children}</AdminShell>
        )}
      </Providers>
    </div>
  )
}

function parsePathFromUrl(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).pathname
  } catch {
    return null
  }
}
