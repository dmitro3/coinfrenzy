import Link from 'next/link'

import { canDeleteSuppression, canManageSuppression } from '@coinfrenzy/core/auth'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'

import { fetchSuppressionAnalytics, listSuppressionForAdmin } from '../_data'
import { SuppressionAdmin } from './_controls'
import { SuppressionTrend } from './_trend'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const session = await requireAdminSession('/admin/crm/suppression')
  const role = session.payload.role
  const canManage = canManageSuppression(role)
  const canDelete = canDeleteSuppression(role)
  const [rows, analytics] = await Promise.all([
    listSuppressionForAdmin(),
    fetchSuppressionAnalytics(),
  ])

  const reasonCounts = new Map(analytics.byReason.map((r) => [r.reason, r.count]))
  const sourceCounts = new Map(analytics.bySource.map((s) => [s.source, s.count]))
  const topReason = analytics.byReason[0]
  const bounces = sourceCounts.get('bounce') ?? 0
  const complaints = sourceCounts.get('complaint') ?? 0
  const unsubs = sourceCounts.get('unsubscribe') ?? 0
  void reasonCounts

  return (
    <ListPageShell
      title="Suppression list"
      subtitle={`${rows.length.toLocaleString()} entries`}
      description="Players blocked from receiving CRM messages. Manager+ can add entries; master can remove."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Suppression' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Total suppressed', value: analytics.total.toLocaleString(), tone: 'neutral' },
        {
          label: 'Bounces',
          value: bounces.toLocaleString(),
          tone: bounces > 0 ? 'attention' : 'neutral',
        },
        {
          label: 'Unsubscribes',
          value: unsubs.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Complaints',
          value: complaints.toLocaleString(),
          tone: complaints > 0 ? 'critical' : 'neutral',
        },
        {
          label: 'Top reason',
          value: topReason ? topReason.reason : '—',
          delta: topReason ? `${topReason.count.toLocaleString()} hits` : undefined,
          tone: 'neutral',
        },
      ]}
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-primary">Last 30 days</h3>
              <SuppressionTrend trend={analytics.trend} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-primary">
                Top campaigns triggering unsubscribes
              </h3>
              {analytics.topCampaignsTriggering.length === 0 ? (
                <p className="text-sm text-ink-tertiary">
                  No unsubscribes attributable to campaigns in the last 30 days.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {analytics.topCampaignsTriggering.map((c) => (
                    <li
                      key={c.campaignName}
                      className="flex items-center justify-between border-b border-line-subtle/60 py-1"
                    >
                      <span className="text-ink-primary">{c.campaignName}</span>
                      <span className="font-mono text-amber-300">{c.unsubs.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <SuppressionAdmin canManage={canManage} canDelete={canDelete} rows={rows} />
      </div>
    </ListPageShell>
  )
}
