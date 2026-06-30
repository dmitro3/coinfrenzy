import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { CustomQueryWorkbench } from './workbench'

export const dynamic = 'force-dynamic'

export default async function CustomQueryPage() {
  const session = await requireAdminSession('/admin/reports/custom-query')
  if (session.payload.role !== 'master') {
    redirect('/admin/reports')
  }

  const db = getDb()
  const saved = await db
    .select()
    .from(schema.customQueryDefinitions)
    .orderBy(desc(schema.customQueryDefinitions.createdAt))
    .limit(50)

  return (
    <ListPageShell
      title="Custom Query"
      subtitle="Master-only · read-only · 30 s timeout · 10,000-row cap"
      description="Escape hatch for ad-hoc analytics — read-only Postgres against an allow-listed schema. Every run is recorded to audit_log."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: 'Custom Query' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Mode',
          value: 'Read-only',
          delta: 'no writes can ever execute',
          tone: 'positive',
        },
        {
          label: 'Timeout',
          value: '30 s',
          delta: 'statement timeout enforced',
          tone: 'neutral',
        },
        {
          label: 'Row cap',
          value: '10,000',
          delta: 'larger exports use Export Center',
          tone: 'neutral',
        },
        {
          label: 'Audit',
          value: 'Every run',
          delta: 'spec + duration + row count logged',
          tone: 'positive',
        },
      ]}
    >
      <CustomQueryWorkbench
        savedQueries={saved.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          queryConfig: r.queryConfig,
          schedule: r.schedule,
        }))}
      />
    </ListPageShell>
  )
}
