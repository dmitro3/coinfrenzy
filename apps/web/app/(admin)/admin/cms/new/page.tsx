import 'server-only'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { canEditContent } from '@coinfrenzy/core/auth'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'

import { DEFAULT_PAGE_VALUES, PageForm } from '../_form'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/cms/new')
  const role = session.payload.role
  const canEdit = canEditContent(role)
  if (!canEdit) redirect('/admin/cms')

  return (
    <div className="space-y-6 px-8 py-8">
      <PageHeader
        title="New page"
        description="Create a new static content page. It renders at /p/[slug] with the same chrome the existing legal pages use."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CMS', href: '/admin/cms' },
          { label: 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <PageForm mode="create" initial={DEFAULT_PAGE_VALUES} slugWasGenerated />
    </div>
  )
}
