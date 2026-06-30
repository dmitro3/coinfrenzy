import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { crm } from '@coinfrenzy/core'
import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { getDb } from '@coinfrenzy/db/client'

import { CampaignWizardWrapper } from './_wizard'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ segmentId?: string; clone?: string }>
}

export default async function Page({ searchParams }: PageProps) {
  const { segmentId, clone } = await searchParams
  const db = getDb()
  const segmentRows = await db.execute(sql`
    SELECT id, name, cached_count
    FROM crm_segments
    WHERE status = 'active'
    ORDER BY updated_at DESC
  `)
  const emailRows = await db.execute(sql`
    SELECT id, slug, display_name, subject_template, body_html_template
    FROM email_templates WHERE is_current = true ORDER BY updated_at DESC
  `)
  const smsRows = await db.execute(sql`
    SELECT id, slug, display_name, body_template
    FROM sms_templates WHERE is_current = true ORDER BY updated_at DESC
  `)

  const variables = crm.TEMPLATE_VARIABLES.map((v) => ({
    key: v.key,
    label: v.label,
    category: v.category,
    example: String(v.example ?? ''),
  }))

  const conversionEventOptions = crm.getConversionEvents().map((e) => ({
    name: e.name,
    label: e.label,
  }))

  // Clone source — load the existing campaign and seed wizard initial state.
  let initial:
    | {
        segmentId?: string
        channel?: 'email' | 'sms' | 'in_app'
        templateId?: string
        conversionEvent?: string
        name?: string
        description?: string
      }
    | undefined
  if (clone) {
    const cloneRows = (await db.execute(sql`
      SELECT name, description, segment_id, channel, template_id, conversion_event
      FROM crm_campaigns WHERE id = ${clone} LIMIT 1
    `)) as unknown as Array<Record<string, unknown>>
    const src = cloneRows[0]
    if (src) {
      initial = {
        segmentId: (src.segment_id as string | null) ?? undefined,
        channel: (src.channel as 'email' | 'sms' | 'in_app') ?? 'email',
        templateId: (src.template_id as string | null) ?? undefined,
        conversionEvent: (src.conversion_event as string | null) ?? undefined,
        name: `Copy of ${String(src.name ?? '')}`.trim(),
        description: (src.description as string | null) ?? '',
      }
    }
  } else if (segmentId) {
    initial = { segmentId }
  }

  return (
    <PageContainer>
      <PageHeader
        title="New campaign"
        description="5 quick steps. Test send to yourself before going live."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Campaigns', href: '/admin/crm/campaigns' },
          { label: 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <CampaignWizardWrapper
        segments={(segmentRows as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          name: String(r.name),
          cachedCount: (r.cached_count as number | null) ?? null,
        }))}
        emailTemplates={(emailRows as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          slug: String(r.slug),
          displayName: String(r.display_name),
          subjectTemplate: (r.subject_template as string | null) ?? '',
          bodyTemplate: (r.body_html_template as string | null) ?? '',
        }))}
        smsTemplates={(smsRows as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          slug: String(r.slug),
          displayName: String(r.display_name),
          bodyTemplate: (r.body_template as string | null) ?? '',
        }))}
        variables={variables}
        conversionEventOptions={conversionEventOptions}
        initial={initial}
      />
    </PageContainer>
  )
}
