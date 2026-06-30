import Link from 'next/link'
import { sql } from 'drizzle-orm'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { getDb } from '@coinfrenzy/db/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS_TONE: Record<string, StatusPillTone> = {
  draft: 'neutral',
  scheduled: 'notice',
  sending: 'attention',
  sent: 'positive',
  cancelled: 'critical',
  paused: 'neutral',
}

interface Row {
  id: string
  name: string
  channel: string
  status: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  conv: number
  segment_name: string | null
  sent_at: string | null
}

export default async function Page() {
  const db = getDb()
  const rows = (await db.execute(sql`
    SELECT
      c.id, c.name, c.channel, c.status,
      c.sent_count AS sent,
      c.delivered_count AS delivered,
      c.opened_count AS opened,
      c.clicked_count AS clicked,
      c.conversion_count AS conv,
      s.name AS segment_name,
      c.sent_completed_at AS sent_at
    FROM crm_campaigns c
    LEFT JOIN crm_segments s ON s.id = c.segment_id
    ORDER BY c.sent_count DESC NULLS LAST, c.updated_at DESC
    LIMIT 200
  `)) as unknown as Row[]

  return (
    <ListPageShell
      title="Campaign performance"
      subtitle={`${rows.length.toLocaleString()} campaigns`}
      description="Sortable performance across all campaigns. Click into any campaign for funnel and A/B detail."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Performance', href: '/admin/crm/performance' },
        { label: 'Campaigns' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
    >
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-ink-tertiary">
              No campaigns yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Campaign</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Sent</th>
                  <th className="px-4 py-2 text-right">Delivery</th>
                  <th className="px-4 py-2 text-right">Open</th>
                  <th className="px-4 py-2 text-right">Click</th>
                  <th className="px-4 py-2 text-right">Conv</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sent = Number(r.sent ?? 0)
                  const delivery = sent > 0 ? (Number(r.delivered ?? 0) / sent) * 100 : 0
                  const open = sent > 0 ? (Number(r.opened ?? 0) / sent) * 100 : 0
                  const click = sent > 0 ? (Number(r.clicked ?? 0) / sent) * 100 : 0
                  const conv = sent > 0 ? (Number(r.conv ?? 0) / sent) * 100 : 0
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/crm/campaigns/${r.id}`}
                          className="font-medium text-ink-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                        <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                          {r.channel}
                          {r.segment_name ? ` · ${r.segment_name}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill
                          status="custom"
                          color={STATUS_TONE[r.status] ?? 'neutral'}
                          label={r.status}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-primary">
                        {sent.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                        {sent > 0 ? `${delivery.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                        {sent > 0 ? `${open.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">
                        {sent > 0 ? `${click.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-positive">
                        {sent > 0 ? `${conv.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
