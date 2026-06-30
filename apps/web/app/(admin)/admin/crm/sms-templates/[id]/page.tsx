import Link from 'next/link'
import { notFound } from 'next/navigation'

import { crm } from '@coinfrenzy/core'
import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { getSmsTemplateForAdmin } from '../../_data'
import { SmsTemplateEditor } from '../_editor'
import { listSamplePlayers } from '../../_template-shared'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const template = await getSmsTemplateForAdmin(id)
  if (!template) return notFound()

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
        title={template.displayName}
        subtitle={`Slug: ${template.slug} · v${template.version}`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'SMS templates', href: '/admin/crm/sms-templates' },
          { label: template.displayName },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      {sp.created === '1' ? (
        <div className="mb-4 rounded-md border border-positive/40 bg-positive/10 px-4 py-3 text-sm text-positive">
          SMS template created successfully.
        </div>
      ) : null}
      <SmsTemplateEditor
        templateId={template.id}
        variables={variables}
        samplePlayers={samplePlayers}
        initial={{
          slug: template.slug,
          displayName: template.displayName,
          bodyTemplate: template.bodyTemplate,
          category: template.category,
        }}
      />
    </PageContainer>
  )
}
