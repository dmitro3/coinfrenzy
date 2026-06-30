import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { fetchChannelStats } from '../../_data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  in_app: 'In-app',
  push: 'Push',
}

const CHANNEL_BAR: Record<string, string> = {
  email: 'bg-sky-500/70',
  sms: 'bg-emerald-500/70',
  in_app: 'bg-violet-500/70',
  push: 'bg-amber-500/70',
}

export default async function Page() {
  const channels = await fetchChannelStats()
  const totalSent = channels.reduce((s, c) => s + c.sent, 0)

  return (
    <ListPageShell
      title="Channel performance"
      subtitle="Last 30 days"
      description="Side-by-side comparison across your active channels. Use this to allocate creative effort."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Performance', href: '/admin/crm/performance' },
        { label: 'Channels' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Total sent (30d)', value: totalSent.toLocaleString(), tone: 'neutral' },
        {
          label: 'Best open rate',
          value: bestRate(channels, 'openRate'),
          tone: 'positive',
        },
        {
          label: 'Best click rate',
          value: bestRate(channels, 'clickRate'),
          tone: 'positive',
        },
        {
          label: 'Best delivery',
          value: bestRate(channels, 'deliveryRate'),
          tone: 'positive',
        },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {channels.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-line-subtle bg-surface px-4 py-12 text-center text-sm text-ink-tertiary">
            No channel sends in the last 30 days yet.
          </div>
        ) : (
          channels.map((c) => (
            <Card key={c.channel}>
              <CardContent className="p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-ink-primary">
                    {CHANNEL_LABEL[c.channel] ?? c.channel}
                  </h3>
                  <span className="text-xs text-ink-tertiary">{c.sent.toLocaleString()} sent</span>
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <Bar
                    label="Delivery"
                    value={c.deliveryRate}
                    sub={`${c.delivered.toLocaleString()} delivered`}
                    color={CHANNEL_BAR[c.channel] ?? 'bg-violet-500/70'}
                  />
                  <Bar
                    label="Open"
                    value={c.openRate}
                    sub={`${c.opened.toLocaleString()} opens`}
                    color={CHANNEL_BAR[c.channel] ?? 'bg-violet-500/70'}
                  />
                  <Bar
                    label="Click"
                    value={c.clickRate}
                    sub={`${c.clicked.toLocaleString()} clicks`}
                    color={CHANNEL_BAR[c.channel] ?? 'bg-violet-500/70'}
                  />
                </dl>

                <div className="mt-3 flex justify-between text-xs text-ink-tertiary">
                  <span>Bounced: {c.bounced.toLocaleString()}</span>
                  <span>Unsubs: {c.unsubscribed.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ListPageShell>
  )
}

function Bar({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number
  sub: string
  color: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-tertiary">{label}</span>
        <span className="tabular-nums text-ink-primary">{value.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-ink-tertiary">{sub}</div>
    </div>
  )
}

function bestRate(
  channels: Array<{ channel: string; openRate: number; clickRate: number; deliveryRate: number }>,
  key: 'openRate' | 'clickRate' | 'deliveryRate',
): string {
  if (channels.length === 0) return '—'
  const best = channels.reduce((b, c) => (c[key] > b[key] ? c : b), channels[0]!)
  return `${(CHANNEL_LABEL[best.channel] ?? best.channel).slice(0, 8)} (${best[key].toFixed(1)}%)`
}
