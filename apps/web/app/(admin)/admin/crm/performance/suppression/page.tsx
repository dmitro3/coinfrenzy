import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { fetchSuppressionAnalytics } from '../../_data'
import { SuppressionTrend } from '../../suppression/_trend'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const a = await fetchSuppressionAnalytics()
  const topReason = a.byReason[0]
  const totalRecent = a.trend.reduce((s, t) => s + t.count, 0)

  return (
    <ListPageShell
      title="Suppression analytics"
      subtitle="Last 30 days"
      description="Where suppressions are coming from and which campaigns are triggering unsubs."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Performance', href: '/admin/crm/performance' },
        { label: 'Suppression' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Total on list', value: a.total.toLocaleString(), tone: 'neutral' },
        {
          label: 'New (30d)',
          value: totalRecent.toLocaleString(),
          tone: totalRecent > 0 ? 'attention' : 'neutral',
        },
        {
          label: 'Top reason',
          value: topReason ? topReason.reason : '—',
          delta: topReason ? `${topReason.count.toLocaleString()} hits` : undefined,
          tone: 'neutral',
        },
        {
          label: 'Top source',
          value: a.bySource[0]?.source ?? '—',
          delta: a.bySource[0] ? `${a.bySource[0].count.toLocaleString()}` : undefined,
          tone: 'neutral',
        },
      ]}
    >
      <div className="space-y-6">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-primary">
              New suppressions, last 30 days
            </h3>
            <SuppressionTrend trend={a.trend} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-primary">By reason</h3>
              {a.byReason.length === 0 ? (
                <div className="py-6 text-center text-sm text-ink-tertiary">No reasons yet.</div>
              ) : (
                <ul className="space-y-2">
                  {a.byReason.map((r) => (
                    <BarRow
                      key={r.reason}
                      label={r.reason}
                      value={r.count}
                      total={a.total}
                      tone="text-amber-300"
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-primary">By source</h3>
              {a.bySource.length === 0 ? (
                <div className="py-6 text-center text-sm text-ink-tertiary">No sources yet.</div>
              ) : (
                <ul className="space-y-2">
                  {a.bySource.map((s) => (
                    <BarRow
                      key={s.source}
                      label={s.source}
                      value={s.count}
                      total={a.total}
                      tone="text-rose-300"
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-primary">
              Top campaigns triggering unsubs
            </h3>
            {a.topCampaignsTriggering.length === 0 ? (
              <p className="text-sm text-ink-tertiary">
                No campaign-attributed unsubscribes in the last 30 days.
              </p>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {a.topCampaignsTriggering.map((c) => (
                  <li
                    key={c.campaignName}
                    className="flex items-center justify-between py-2 text-sm"
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
    </ListPageShell>
  )
}

function BarRow({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <li>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-primary">{label}</span>
        <span className={`font-mono ${tone}`}>{value.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
        <div className="h-full bg-violet-500/70" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-ink-tertiary">{pct.toFixed(1)}% of total</div>
    </li>
  )
}
