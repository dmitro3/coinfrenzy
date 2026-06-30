import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'

import { crm } from '@coinfrenzy/core'
import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { getDb } from '@coinfrenzy/db/client'

import { EmailTemplateEditor } from '../_editor'
import { listSamplePlayers } from '../../_template-shared'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT id, slug, display_name, version, subject_template, body_html_template,
           body_text_template, from_email, reply_to, category
    FROM email_templates WHERE id = ${id} LIMIT 1
  `)
  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return notFound()

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
        title={String(row.display_name)}
        subtitle={`Slug: ${row.slug} · v${row.version}`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Email templates', href: '/admin/crm/email-templates' },
          { label: String(row.display_name) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <EmailTemplateEditor
        templateId={String(row.id)}
        variables={variables}
        samplePlayers={samplePlayers}
        initial={{
          slug: String(row.slug),
          displayName: String(row.display_name),
          subjectTemplate: String(row.subject_template),
          bodyHtmlTemplate: String(row.body_html_template),
          bodyTextTemplate: (row.body_text_template as string | null) ?? null,
          fromEmail: (row.from_email as string | null) ?? null,
          replyTo: (row.reply_to as string | null) ?? null,
          category: (row.category as string | null) ?? null,
        }}
      />
    </PageContainer>
  )
}
