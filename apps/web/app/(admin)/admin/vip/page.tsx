import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Crown, Diamond, Sparkles, UserCheck, UserPlus, Users } from 'lucide-react'

import { canCreateHost, canViewAllVips } from '@coinfrenzy/core/auth'
import { ListPageShell, StatusPill, VipBadge } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchRecentQualifications, fetchVipOverview, fetchVipsByHost } from './_data'
import { CreateHostButton } from './hosts/_create-host-button'

export const dynamic = 'force-dynamic'

export default async function VipOverviewPage() {
  const session = await requireAdminSession('/admin/vip')
  if (!canViewAllVips(session.payload.role)) {
    redirect('/admin')
  }

  const [overview, byHost, recent] = await Promise.all([
    fetchVipOverview(),
    fetchVipsByHost(),
    fetchRecentQualifications(7, 10),
  ])

  return (
    <ListPageShell
      title="VIP / Hosts"
      subtitle={`${overview.totalVips.toLocaleString()} active VIPs`}
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'VIP / Hosts' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={canCreateHost(session.payload.role) ? <CreateHostButton /> : null}
      insights={[
        {
          label: 'Total VIPs',
          value: overview.totalVips.toLocaleString(),
          icon: <Crown />,
          tone: 'positive',
        },
        {
          label: 'Unassigned',
          value: overview.unassignedVips.toLocaleString(),
          delta: overview.unassignedVips > 0 ? 'Needs a host' : 'All covered',
          tone: overview.unassignedVips > 0 ? 'attention' : 'positive',
          icon: <UserPlus />,
          href: '/admin/vip/assignments',
        },
        {
          label: 'New this week',
          value: overview.newThisWeek.toLocaleString(),
          icon: <Sparkles />,
          tone: 'notice',
        },
        {
          label: 'Top spending',
          value: formatUsd(overview.topSpendingUsdMinor),
          icon: <Diamond />,
          tone: 'neutral',
        },
        {
          label: 'Total VIP LTV',
          value: formatUsd(overview.totalVipLtvUsdMinor),
          icon: <UserCheck />,
          tone: 'neutral',
        },
      ]}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>VIPs by host</CardTitle>
          <Link href="/admin/vip/hosts" className="text-sm text-brand hover:underline">
            Manage hosts →
          </Link>
        </CardHeader>
        <CardContent>
          {byHost.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              No active hosts yet.{' '}
              <Link href="/admin/vip/hosts" className="text-brand">
                Create one
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="py-2 pr-4 text-left font-medium">Host</th>
                    <th className="py-2 pr-4 text-right font-medium">VIPs</th>
                    <th className="py-2 pr-4 text-right font-medium">Total LTV</th>
                    <th className="py-2 pr-4 text-left font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {byHost.map((h) => (
                    <tr key={h.hostId} className="border-b border-line-subtle/40">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/admin/vip/hosts/${h.hostId}`}
                          className="text-ink-primary hover:underline"
                        >
                          <p className="text-sm font-medium">{h.hostName}</p>
                          <p className="text-xs text-ink-tertiary">{h.hostEmail}</p>
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{h.vipCount}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatUsd(h.totalLtvUsdMinor)}
                      </td>
                      <td className="py-3 pr-4 text-ink-tertiary">
                        {h.lastInteractionAt
                          ? relative(h.lastInteractionAt)
                          : 'No interactions yet'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent VIP qualifications</CardTitle>
            <Link href="/admin/vip/all-vips" className="text-sm text-brand hover:underline">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-ink-tertiary">No new VIPs in the last 7 days.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="py-2 pr-4 text-left font-medium">Player</th>
                    <th className="py-2 pr-4 text-right font-medium">Lifetime spend</th>
                    <th className="py-2 pr-4 text-left font-medium">Qualified</th>
                    <th className="py-2 pr-4 text-left font-medium">Host</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.playerId} className="border-b border-line-subtle/40">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/admin/vip/${r.playerId}`}
                          className="text-ink-primary hover:underline"
                        >
                          <p className="text-sm font-medium">{r.email}</p>
                          {r.displayName ? (
                            <p className="text-xs text-ink-tertiary">{r.displayName}</p>
                          ) : null}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatUsd(r.lifetimeSpendUsdMinor)}
                      </td>
                      <td className="py-3 pr-4 text-ink-tertiary">{relative(r.vipQualifiedAt)}</td>
                      <td className="py-3 pr-4">
                        {r.assignedHostId ? (
                          <StatusPill status="custom" label="Assigned" color="positive" />
                        ) : (
                          <StatusPill status="custom" label="Unassigned" color="attention" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-attention" />
              Unassigned VIPs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.unassignedVips === 0 ? (
              <p className="text-sm text-ink-tertiary">All VIPs have a host. Nice.</p>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular-nums text-ink-primary">
                  {overview.unassignedVips}
                </p>
                <p className="mt-1 text-sm text-ink-secondary">
                  Need to be assigned to a host so they can build a relationship.
                </p>
                <Link
                  href="/admin/vip/assignments"
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
                >
                  Assign now
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-tertiary">
        <span>Status legend:</span>
        <VipBadge status="candidate" compact />
        <VipBadge status="vip" compact />
        <VipBadge status="high_roller" compact />
      </div>
    </ListPageShell>
  )
}

function relative(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return d.toLocaleDateString()
}
