import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Award, ClipboardCheck, UserCheck, Users } from 'lucide-react'

import { canCreateHost, canViewAllVips } from '@coinfrenzy/core/auth'
import { ListPageShell, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchHostsList } from '../_data'
import { CreateHostButton } from './_create-host-button'

export const dynamic = 'force-dynamic'

export default async function HostsListPage() {
  const session = await requireAdminSession('/admin/vip/hosts')
  if (!canViewAllVips(session.payload.role)) {
    redirect('/admin')
  }

  const hosts = await fetchHostsList()
  const totalVipLtv = hosts.reduce((acc, h) => acc + h.totalLtvUsdMinor, 0n)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const activeHosts = hosts.filter((h) => h.lastLoginAt && h.lastLoginAt >= thirtyDaysAgo).length
  const avgVipsPerHost =
    hosts.length === 0
      ? 0
      : Math.round((hosts.reduce((a, h) => a + h.vipCount, 0) / hosts.length) * 10) / 10

  return (
    <ListPageShell
      title="Hosts"
      subtitle={`${hosts.length} total · ${activeHosts} active`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'VIP / Hosts', href: '/admin/vip' },
        { label: 'Hosts' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={canCreateHost(session.payload.role) ? <CreateHostButton /> : null}
      insights={[
        {
          label: 'Total hosts',
          value: hosts.length.toLocaleString(),
          icon: <Users />,
          tone: 'positive',
        },
        {
          label: 'Active 30d',
          value: activeHosts.toLocaleString(),
          icon: <UserCheck />,
          tone: 'positive',
        },
        {
          label: 'Avg VIPs per host',
          value: avgVipsPerHost.toString(),
          icon: <ClipboardCheck />,
          tone: 'neutral',
        },
        {
          label: 'Total LTV under host care',
          value: formatUsd(totalVipLtv),
          icon: <Award />,
          tone: 'neutral',
        },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {hosts.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-tertiary">
              No hosts yet.{' '}
              {canCreateHost(session.payload.role) ? 'Click "Add host" above to create one.' : ''}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="px-4 py-3 text-left font-medium">Host</th>
                    <th className="px-4 py-3 text-right font-medium">VIPs</th>
                    <th className="px-4 py-3 text-right font-medium">Total LTV</th>
                    <th className="px-4 py-3 text-right font-medium">Last 30d touches</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h) => (
                    <tr
                      key={h.id}
                      className="border-b border-line-subtle/40 hover:bg-surface-hover/40"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/vip/hosts/${h.id}`} className="hover:underline">
                          <p className="font-medium text-ink-primary">{h.displayName}</p>
                          <p className="text-xs text-ink-tertiary">{h.email}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{h.vipCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatUsd(h.totalLtvUsdMinor)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{h.interactionsLast30d}</td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status="custom"
                          label={h.status === 'active' ? 'Active' : 'Inactive'}
                          color={h.status === 'active' ? 'positive' : 'neutral'}
                        />
                      </td>
                      <td className="px-4 py-3 text-ink-tertiary">
                        {h.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
