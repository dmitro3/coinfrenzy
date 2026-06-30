import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DetailLayout, KeyValueGrid, PageHeader, StatTile, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { fetchGameDetail } from '../../_data'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function GameDetailPage({ params }: PageProps) {
  await requireAdminSession()
  const { slug } = await params
  const detail = await fetchGameDetail(slug)
  if (!detail) notFound()
  const { game } = detail

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={game.displayName}
        subtitle={game.providerName}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Casino' },
          { label: 'Games', href: '/admin/casino/games' },
          { label: game.displayName },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <DetailLayout
        primary={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Plays today" value={game.playsToday.toLocaleString()} />
            <StatTile label="GGR today" value={formatCoins(game.ggrTodaySc.toString())} unit="SC" />
            <StatTile
              label="RTP"
              value={game.rtp ? `${(Number(game.rtp) * 100).toFixed(2)}%` : '—'}
            />
            <StatTile label="Volatility" value={game.volatility?.replace('_', ' ') ?? '—'} />
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
                      value: <span className="font-mono text-xs">{game.slug}</span>,
                    },
                    {
                      label: 'Provider',
                      value: (
                        <Link
                          href={`/admin/casino/providers/${game.providerSlug}`}
                          className="hover:underline"
                        >
                          {game.providerName}
                        </Link>
                      ),
                    },
                    { label: 'Category', value: game.category },
                    { label: 'Sub-category', value: game.subCategory ?? '—' },
                    {
                      label: 'Status',
                      value:
                        game.status === 'active' ? (
                          <StatusPill status="active" />
                        ) : (
                          <StatusPill status="custom" color="neutral" label={game.status} />
                        ),
                    },
                    {
                      label: 'Featured',
                      value: game.isFeatured ? (
                        <StatusPill status="custom" color="notice" label="Yes" />
                      ) : (
                        '—'
                      ),
                    },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    {
                      label: 'Min bet',
                      value: game.minBetSc ? `${formatCoins(game.minBetSc)} SC` : '—',
                    },
                    {
                      label: 'Max bet',
                      value: game.maxBetSc ? `${formatCoins(game.maxBetSc)} SC` : '—',
                    },
                    { label: 'Playthrough wt', value: game.playthroughWeight },
                    { label: 'Lobby order', value: game.lobbyOrder?.toString() ?? '—' },
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
