import 'server-only'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth as coreAuth } from '@coinfrenzy/core'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'

import { DEFAULT_FORM_VALUES, PackageForm } from '../_form'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/packages/new')
  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    redirect('/admin/packages')
  }

  return (
    <div className="space-y-6 px-8 py-8">
      <PageHeader
        title="New package"
        description="Configure pricing, coins, playthrough, visibility, and promo banner."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Packages', href: '/admin/packages' },
          { label: 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <PackageForm mode="create" initial={DEFAULT_FORM_VALUES} />
    </div>
  )
}
