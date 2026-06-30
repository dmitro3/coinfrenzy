import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Crown, Diamond, Sparkles, UserPlus } from 'lucide-react'

import { canViewAllVips } from '@coinfrenzy/core/auth'
import { HostBadge, ListPageShell, VipBadge } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchAllVips, fetchVipOverview, type AdminVipListFilters } from '../_data'
import { FilterStrip } from './_filter-strip'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AllVipsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/vip/all-vips')
  if (!canViewAllVips(session.payload.role)) {
    redirect('/admin')
  }

  const sp = await searchParams
  const filters: AdminVipListFilters = {
    search: single(sp.q),
    status: (single(sp.status) ?? 'all') as AdminVipListFilters['status'],
    hostId: (single(sp.host) ?? 'all') as AdminVipListFilters['hostId'],
    activity: (single(sp.activity) ?? 'all') as AdminVipListFilters['activity'],
    kycLevel: (single(sp.kyc) ?? 'all') as AdminVipListFilters['kycLevel'],
  }

  const [overview, { rows, totalCount }] = await Promise.all([
    fetchVipOverview(),
    fetchAllVips(filters),
  ])

  return (
    <ListPageShell
      title="All VIPs"
      subtitle={`${totalCount.toLocaleString()} VIPs match`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'VIP / Hosts', href: '/admin/vip' },
        { label: 'All VIPs' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<ExportCsvButton href="/api/admin/vips/export" />}
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
          icon: <UserPlus />,
          tone: overview.unassignedVips > 0 ? 'attention' : 'positive',
        },
        {
          label: 'New this week',
          value: overview.newThisWeek.toLocaleString(),
          icon: <Sparkles />,
          tone: 'notice',
        },
        {
          label: 'Top spender LTV',
          value: formatUsd(overview.topSpendingUsdMinor),
          icon: <Diamond />,
          tone: 'neutral',
        },
      ]}
    >
      <FilterStrip filters={filters} />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-tertiary">
              No VIPs match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                    <th className="px-4 py-3 text-left font-medium">Player</th>
                    <th className="px-4 py-3 text-right font-medium">Lifetime spend</th>
                    <th className="px-4 py-3 text-left font-medium">Host</th>
                    <th className="px-4 py-3 text-left font-medium">VIP status</th>
                    <th className="px-4 py-3 text-left font-medium">KYC</th>
                    <th className="px-4 py-3 text-left font-medium">Last seen</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle/40 hover:bg-surface-hover/40"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/vip/${r.id}`} className="hover:underline">
                          <p className="font-medium text-ink-primary">{r.email}</p>
                          {r.displayName ? (
                            <p className="text-xs text-ink-tertiary">{r.displayName}</p>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {formatUsd(r.lifetimeSpendUsdMinor)}
                      </td>
                      <td className="px-4 py-3">
                        <HostBadge
                          host={
                            r.assignedHostId && r.assignedHostName
                              ? { id: r.assignedHostId, displayName: r.assignedHostName }
                              : null
                          }
                          renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <VipBadge
                          status={r.vipStatus as 'vip' | 'high_roller' | 'candidate'}
                          compact
                        />
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">L{r.kycLevel}</td>
                      <td className="px-4 py-3 text-ink-tertiary">
                        {r.lastSeenAt ? relative(r.lastSeenAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/vip/${r.id}`}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          View
                        </Link>
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

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
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
