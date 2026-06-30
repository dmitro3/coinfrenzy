import Link from 'next/link'
import { ArrowUpDown, Trophy } from 'lucide-react'

import { casino } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'
import { formatCoins } from '@/lib/format'

import { parseWindow } from '../_window-utils'
import { WindowSelector } from '../_window-selector'
import { GamesListClient } from './games-list-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const WINDOW_LABEL: Record<string, string> = {
  '30d': '30d',
  '90d': '90d',
  '180d': '180d',
  '1y': '1y',
  all: 'all time',
}

export default async function GamesPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/casino/games')
  const sp = await searchParams
  const initialProvider = typeof sp.provider === 'string' ? sp.provider : 'all'
  const window = parseWindow(sp.window)

  const ctx = buildAdminRscContext()
  const [games, totals] = await Promise.all([
    casino.getGameStats(ctx, window),
    casino.getGameDashboardTotals(ctx, window),
  ])

  const total = games.length
  const active = games.filter((g) => g.status === 'active').length
  const newThisWeek = games.filter((g) => g.isNew).length

  // Top-5 leaderboard rail for the current window.
  const topGames = [...games]
    .filter((g) => g.bet > 0n)
    .sort((a, b) => Number(b.ggr - a.ggr))
    .slice(0, 5)

  return (
    <ListPageShell
      title="Game Dashboard"
      subtitle={`${total.toLocaleString()} games`}
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Casino' }, { label: 'Games' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/casino/games/reorder"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Reorder
          </Link>
          <WindowSelector value={window} />
        </div>
      }
      insights={[
        {
          label: `Total Players (${WINDOW_LABEL[window]})`,
          value: totals.totalPlayers.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: `Total GGR (${WINDOW_LABEL[window]})`,
          value: `${formatCoins(totals.totalGgr.toString())} SC`,
          tone: 'positive',
        },
        {
          label: `Total Bet (${WINDOW_LABEL[window]})`,
          value: `${formatCoins(totals.totalBet.toString())} SC`,
          tone: 'neutral',
        },
        {
          label: `Total Win (${WINDOW_LABEL[window]})`,
          value: `${formatCoins(totals.totalWin.toString())} SC`,
          tone: 'neutral',
        },
        {
          label: `RTP (${WINDOW_LABEL[window]})`,
          value: `${totals.rtpPct.toFixed(2)}%`,
          tone: 'neutral',
        },
        {
          label: `Hold (${WINDOW_LABEL[window]})`,
          value: `${totals.holdPct.toFixed(2)}%`,
          delta: `${formatCoins(totals.totalGgr.toString())} SC`,
          tone: 'positive',
        },
      ]}
    >
      {topGames.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" />
              Top games ({WINDOW_LABEL[window]})
            </CardTitle>
            <span className="text-xs text-ink-tertiary">by GGR</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {topGames.map((g, idx) => {
                const holdPct = g.bet > 0n ? Number((g.ggr * 10_000n) / g.bet) / 100 : 0
                return (
                  <Link
                    key={g.id}
                    href={`/admin/casino/games/${g.slug}`}
                    className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface px-3 py-2 hover:bg-surface-hover"
                  >
                    <RankPill rank={idx} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-primary">
                        {g.displayName}
                      </div>
                      <div className="truncate text-xs text-ink-tertiary">{g.providerName}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="tabular-nums text-ink-primary">
                        {formatCoins(g.ggr.toString())} SC
                      </div>
                      <div className="tabular-nums text-ink-tertiary">
                        {g.plays.toLocaleString()} plays · {holdPct.toFixed(1)}% hold
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <GamesListClient
        rows={games.map((g) => ({
          id: g.id,
          slug: g.slug,
          displayName: g.displayName,
          providerName: g.providerName,
          providerSlug: g.providerSlug,
          category: g.category,
          subCategory: null,
          rtp: g.rtp,
          volatility: g.volatility,
          status: g.status,
          isFeatured: g.isFeatured,
          isNew: g.isNew,
          playsToday: g.plays,
          ggrTodaySc: g.ggr.toString(),
        }))}
        initialProvider={initialProvider}
        windowLabel={WINDOW_LABEL[window]}
        windowSummary={{ active, newThisWeek }}
      />
    </ListPageShell>
  )
}

function RankPill({ rank }: { rank: number }) {
  const tones = [
    'bg-amber-500 text-amber-50',
    'bg-slate-400 text-slate-50',
    'bg-amber-700 text-amber-50',
    'bg-elevated text-ink-secondary',
    'bg-elevated text-ink-secondary',
  ]
  return (
    <span
      className={
        'inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-xs font-semibold ' +
        tones[Math.min(rank, tones.length - 1)]
      }
    >
      #{rank + 1}
    </span>
  )
}
