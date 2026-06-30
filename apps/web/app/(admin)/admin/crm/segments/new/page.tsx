import Link from 'next/link'

import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { SegmentEditor } from '../_segment-editor'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <PageContainer>
      <PageHeader
        title="New segment"
        description="Build a player filter that campaigns and flows can target. Live count + sample preview update as you build."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Segments', href: '/admin/crm/segments' },
          { label: 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <SegmentEditor />
    </PageContainer>
  )
}
