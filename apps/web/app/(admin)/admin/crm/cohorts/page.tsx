import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { getDb } from '@coinfrenzy/db/client'

import { CohortAnalysisWrapper } from './_wrapper'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const db = getDb()
  const segmentRows = (await db.execute(sql`
    SELECT id, name, cached_count
    FROM crm_segments
    WHERE status = 'active'
    ORDER BY cached_count DESC NULLS LAST
    LIMIT 200
  `)) as unknown as Array<Record<string, unknown>>

  const segments = segmentRows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    cachedCount: (r.cached_count as number | null) ?? null,
  }))

  return (
    <ListPageShell
      title="Cohorts"
      subtitle={`${segments.length.toLocaleString()} segments available`}
      description="Pick a segment, view how it behaves over time. Compare retention, LTV, activity and revenue."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Cohorts' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
    >
      <CohortAnalysisWrapper segments={segments} />
    </ListPageShell>
  )
}
