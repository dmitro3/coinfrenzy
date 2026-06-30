import Link from 'next/link'
import { redirect } from 'next/navigation'

import { hasAtLeast } from '@coinfrenzy/core/auth'

import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'

import { getMigrationDashboardData } from './_data'
import { MigrationClient } from './migration-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/13 — Gamma migration command center.
//
// Master-only. Single screen with:
//   * Recent runs table with status, validation, action links
//   * Snapshot inventory (R2 contents)
//   * Dual-capture toggle (T-30 window)
//   * "Start new run" controls
//   * Open review-queue counter
//
// All mutation goes through /api/admin/migration/*. The page is RSC for
// the initial fetch; the client component handles all interactions.

export default async function MigrationPage() {
  const session = await requireAdminSession('/admin/migration')
  if (!hasAtLeast(session.payload.role, 'master')) {
    redirect('/admin')
  }

  const data = await getMigrationDashboardData()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Gamma migration"
        subtitle="Import pipeline, dual-capture window, and cutover controls"
        breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Migration' }]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <MigrationClient initialData={data} />
    </div>
  )
}
