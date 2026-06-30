import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DetailLayout, KeyValueGrid, PageHeader, StatTile, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { fetchProviderDetail } from '../../_data'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function ProviderDetailPage({ params }: PageProps) {
  await requireAdminSession()
  const { slug } = await params
  const detail = await fetchProviderDetail(slug)
  if (!detail) notFound()
  const { provider, games } = detail

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={provider.displayName}
        subtitle={`${provider.gameCount} games`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Casino' },
          { label: 'Providers', href: '/admin/casino/providers' },
          { label: provider.displayName },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <DetailLayout
        primary={
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Games" value={provider.gameCount.toLocaleString()} />
              <StatTile label="Plays (30d)" value={provider.plays30d.toLocaleString()} />
              <StatTile
                label="GGR (30d)"
                value={formatCoins(provider.ggr30dSc.toString())}
                unit="SC"
              />
              <StatTile
                label="RTP avg"
                value={provider.rtpAvg != null ? `${(provider.rtpAvg * 100).toFixed(2)}%` : '—'}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Games catalogue</CardTitle>
              </CardHeader>
              <CardContent>
                {games.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">No games yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
                        <th className="py-2 pr-3">Game</th>
                        <th className="py-2 pr-3">Category</th>
                        <th className="py-2 pr-3">RTP</th>
                        <th className="py-2 pl-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {games.map((g) => (
                        <tr key={g.id} className="border-b border-line-subtle last:border-b-0">
                          <td className="py-2.5 pr-3">
                            <Link
                              href={`/admin/casino/games/${g.slug}`}
                              className="text-sm font-medium text-ink-primary hover:underline"
                            >
                              {g.displayName}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-sm text-ink-secondary">{g.category}</td>
                          <td className="py-2.5 pr-3 text-sm tabular-nums text-ink-secondary">
                            {g.rtp ? `${(Number(g.rtp) * 100).toFixed(2)}%` : '—'}
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            {g.status === 'active' ? (
                              <StatusPill status="active" />
                            ) : (
                              <StatusPill status="custom" color="neutral" label={g.status} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        }
        sidebar={
          <>
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    {
                      label: 'Slug',
                      value: <span className="font-mono text-xs">{provider.slug}</span>,
                    },
                    { label: 'Aggregator', value: provider.aggregator },
                    {
                      label: 'Status',
                      value:
                        provider.status === 'active' ? (
                          <StatusPill status="active" />
                        ) : (
                          <StatusPill status="custom" color="neutral" label={provider.status} />
                        ),
                    },
                    { label: 'Games', value: provider.gameCount.toLocaleString() },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Performance (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Plays', value: provider.plays30d.toLocaleString() },
                    {
                      label: 'GGR (SC)',
                      value: `${formatCoins(provider.ggr30dSc.toString())} SC`,
                    },
                    {
                      label: 'RTP avg',
                      value:
                        provider.rtpAvg != null ? `${(provider.rtpAvg * 100).toFixed(2)}%` : '—',
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </>
        }
      />
    </div>
  )
}
