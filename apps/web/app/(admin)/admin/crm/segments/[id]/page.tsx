import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { Megaphone, Workflow } from 'lucide-react'

import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { getDb } from '@coinfrenzy/db/client'

import { SegmentEditor } from '../_segment-editor'
import { SegmentCohortPanel } from './_cohort-panel'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

interface UsedByCampaign {
  id: string
  name: string
  status: string
}

interface UsedByFlow {
  id: string
  name: string
  status: string
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT id, name, description, filter_tree, cached_count, count_updated_at, status
    FROM crm_segments
    WHERE id = ${id}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return notFound()

  const usedByCampaigns = (await db.execute(sql`
    SELECT id, name, status FROM crm_campaigns
    WHERE segment_id = ${id}
    ORDER BY updated_at DESC
    LIMIT 20
  `)) as unknown as UsedByCampaign[]

  const usedByFlows = (await db.execute(sql`
    SELECT DISTINCT f.id, f.name, f.status
    FROM crm_flows f
    LEFT JOIN crm_flow_steps s ON s.flow_id = f.id
    WHERE f.trigger_filter::text LIKE ${'%' + id + '%'}
       OR s.config::text LIKE ${'%' + id + '%'}
    ORDER BY f.name
    LIMIT 20
  `)) as unknown as UsedByFlow[]

  return (
    <PageContainer>
      <PageHeader
        title={String(row.name)}
        subtitle={
          row.cached_count !== null
            ? `${Number(row.cached_count).toLocaleString()} matching players`
            : undefined
        }
        description={(row.description as string | null) ?? undefined}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Segments', href: '/admin/crm/segments' },
          { label: String(row.name) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/crm/campaigns/new?segmentId=${id}`}>Send to this segment</Link>
          </Button>
        }
      />

      <div className="space-y-8">
        <SegmentEditor
          segmentId={String(row.id)}
          initialName={String(row.name)}
          initialDescription={(row.description as string | null) ?? ''}
          initialTree={row.filter_tree as never}
        />

        <SegmentCohortPanel filterTree={row.filter_tree as never} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-ink-primary">Used by campaigns</h3>
                </div>
                <span className="text-xs text-ink-tertiary">{usedByCampaigns.length}</span>
              </div>
              {usedByCampaigns.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-tertiary">
                  No campaigns target this segment yet.
                </div>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {usedByCampaigns.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/admin/crm/campaigns/${c.id}`}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover"
                      >
                        <span className="text-sm text-ink-primary">{c.name}</span>
                        <span className="text-xs uppercase tracking-wide text-ink-tertiary">
                          {c.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-ink-primary">Used by flows</h3>
                </div>
                <span className="text-xs text-ink-tertiary">{usedByFlows.length}</span>
              </div>
              {usedByFlows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-tertiary">
                  No flows reference this segment.
                </div>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {usedByFlows.map((f) => (
                    <li key={f.id}>
                      <Link
                        href={`/admin/crm/flows/${f.id}`}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover"
                      >
                        <span className="text-sm text-ink-primary">{f.name}</span>
                        <span className="text-xs uppercase tracking-wide text-ink-tertiary">
                          {f.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
