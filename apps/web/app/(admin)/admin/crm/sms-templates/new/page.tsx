import Link from 'next/link'

import { crm } from '@coinfrenzy/core'
import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { SmsTemplateEditor } from '../_editor'
import { listSamplePlayers } from '../../_template-shared'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const samplePlayers = await listSamplePlayers()
  const variables = crm.TEMPLATE_VARIABLES.map((v) => ({
    key: v.key,
    label: v.label,
    category: v.category,
    example: String(v.example ?? ''),
  }))

  return (
    <PageContainer>
      <PageHeader
        title="New SMS template"
        description="160 chars per segment. STOP tail is appended automatically by the dispatcher."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'SMS templates', href: '/admin/crm/sms-templates' },
          { label: 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <SmsTemplateEditor variables={variables} samplePlayers={samplePlayers} />
    </PageContainer>
  )
}
