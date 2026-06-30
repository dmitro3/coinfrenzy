'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Coins,
  Gamepad2,
  Gift,
  Sparkles,
  Trophy,
} from 'lucide-react'

import {
  ActivityFeed,
  type ActivityFeedItem,
  EmptyState,
  KeyValueGrid,
  QuickInsights,
  StatTile,
  StatusPill,
} from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import {
  formatCoins,
  formatCompactCoins,
  formatCompactInt,
  formatCompactUsd,
  formatUsd,
} from '@/lib/format'

export interface DetailJsonPlayer {
  id: string
  email: string
  username: string | null
  displayName: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  state: string | null
  signupState: string | null
  status: string
  statusReason: string | null
  kycLevel: number
  kycVerifiedAt: string | null
  emailConsent: boolean
  smsConsent: boolean
  twoFactorEnabled: boolean
  rgSelfExcludedUntil: string | null
  firstSeenAt: string
  lastSeenAt: string | null
  lastLoginAt: string | null
  walletGc: WalletJson
  walletSc: WalletJson
  lifetime: {
    totalDepositedUsd: string
    totalRedeemedUsd: string
    netPositionUsd: string
    purchaseCount: number
    redemptionCount: number
    totalWageredSc: string
    totalWonSc: string
    ggrSc: string
    daysActive: number
  } | null
}

export interface WalletJson {
  currency: 'GC' | 'SC'
  currentBalance: string
  balancePurchased: string
  balanceBonus: string
  balancePromo: string
  balanceEarned: string
}

export interface PurchaseJson {
  id: string
  amountUsd: string
  status: string
  cardBrand: string | null
  cardLast4: string | null
  createdAt: string
}

export interface RedemptionJson {
  id: string
  amountUsd: string
  amountSc: string
  status: string
  createdAt: string
  paidAt: string | null
}

export interface BonusJson {
  id: string
  bonusName: string
  bonusType: string
  scAmount: string
  gcAmount: string
  playthroughRequired: string
  playthroughProgress: string
  playthroughComplete: boolean
  status: string
  expiresAt: string | null
  createdAt: string
}

export interface SessionJson {
  id: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
}

export interface AuditJson {
  id: string
  action: string
  actorId: string | null
  actorRole: string | null
  reason: string | null
  occurredAt: string
}

export interface NoteJson {
  id: string
  occurredAt: string
  actorId: string | null
  actorRole: string | null
  note: string
}

export interface ActivityJson {
  id: string
  eventName: string
  eventCategory: string
  amount: string | null
  currency: string | null
  createdAt: string
}

export interface GameActivityJson {
  id: string
  pairId: string
  source: 'bet' | 'win'
  amount: string
  currency: 'GC' | 'SC'
  createdAt: string
  gameId: string | null
  gameName: string | null
  providerName: string | null
  roundId: string | null
  sessionId: string | null
}

export interface GameActivitySummaryJson {
  totalBets: number
  totalWins: number
  scWagered: string
  scWon: string
  netSc: string
  favoriteGame: { name: string; plays: number } | null
}

export interface TopGameJson {
  gameId: string
  gameName: string
  playCount: number
  ggrSc: string
}

export interface TopProviderJson {
  providerId: string
  providerName: string
  betCount: number
  scWagered: string
}

export interface BigWinJson {
  id: string
  gameName: string | null
  amountSc: string
  occurredAt: string
}

interface PlayerDetailClientProps {
  player: DetailJsonPlayer
  purchases: PurchaseJson[]
  redemptions: RedemptionJson[]
  bonuses: BonusJson[]
  sessions: SessionJson[]
  audit: AuditJson[]
  notes: NoteJson[]
  activity: ActivityJson[]
  gameActivity: GameActivityJson[]
  gameActivitySummary: GameActivitySummaryJson
  topGames: TopGameJson[]
  topProviders: TopProviderJson[]
  bigWins: BigWinJson[]
}

type TabKey =
  | 'overview'
  | 'wallets'
  | 'transactions'
  | 'game-activity'
  | 'bonuses'
  | 'sessions'
  | 'notes'
  | 'audit'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'wallets', label: 'Wallets' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'game-activity', label: 'Game Activity' },
  { key: 'bonuses', label: 'Bonuses' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'notes', label: 'Notes' },
  { key: 'audit', label: 'Audit' },
]

export function PlayerDetailClient(props: PlayerDetailClientProps) {
  const [tab, setTab] = React.useState<TabKey>('overview')

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-line-subtle">
        <nav className="flex flex-wrap gap-1" aria-label="Player tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative -mb-px h-9 px-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-brand text-ink-primary'
                  : 'border-b-2 border-transparent text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' ? (
        <OverviewTab
          player={props.player}
          activity={props.activity}
          purchases={props.purchases}
          redemptions={props.redemptions}
          gameActivitySummary={props.gameActivitySummary}
          topGames={props.topGames}
          topProviders={props.topProviders}
          bigWins={props.bigWins}
        />
      ) : null}
      {tab === 'wallets' ? <WalletsTab player={props.player} /> : null}
      {tab === 'transactions' ? (
        <TransactionsTab purchases={props.purchases} redemptions={props.redemptions} />
      ) : null}
      {tab === 'game-activity' ? (
        <GameActivityTab rows={props.gameActivity} summary={props.gameActivitySummary} />
      ) : null}
      {tab === 'bonuses' ? <BonusesTab bonuses={props.bonuses} /> : null}
      {tab === 'sessions' ? <SessionsTab sessions={props.sessions} /> : null}
      {tab === 'notes' ? <NotesTab notes={props.notes} playerId={props.player.id} /> : null}
      {tab === 'audit' ? <AuditTab audit={props.audit} /> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  player,
  activity,
  purchases,
  redemptions,
  gameActivitySummary,
  topGames,
  topProviders,
  bigWins,
}: {
  player: DetailJsonPlayer
  activity: ActivityJson[]
  purchases: PurchaseJson[]
  redemptions: RedemptionJson[]
  gameActivitySummary: GameActivitySummaryJson
  topGames: TopGameJson[]
  topProviders: TopProviderJson[]
  bigWins: BigWinJson[]
}) {
  const lifetime = player.lifetime
  const avgWagerSc = computeAverageWager(gameActivitySummary)
  const netSign = lifetime ? netPositionSign(lifetime.netPositionUsd) : 0
  const netTone: 'neutral' | 'positive' | 'critical' =
    netSign > 0 ? 'positive' : netSign < 0 ? 'critical' : 'neutral'
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Lifetime spend"
          value={lifetime ? formatCompactUsd(lifetime.totalDepositedUsd) : '—'}
          unit="USD"
          fullValue={lifetime ? formatUsd(lifetime.totalDepositedUsd) : undefined}
        />
        <StatTile
          label="Lifetime redemption"
          value={lifetime ? formatCompactUsd(lifetime.totalRedeemedUsd) : '—'}
          unit="USD"
          fullValue={lifetime ? formatUsd(lifetime.totalRedeemedUsd) : undefined}
        />
        <StatTile
          label="Average wager"
          value={avgWagerSc != null ? formatCompactCoins(avgWagerSc) : '—'}
          unit="SC"
          fullValue={avgWagerSc != null ? formatCoins(avgWagerSc) : undefined}
        />
        <StatTile
          label="Net position"
          value={lifetime ? formatCompactUsd(lifetime.netPositionUsd) : '—'}
          unit="USD"
          valueTone={netTone}
          fullValue={lifetime ? formatUsd(lifetime.netPositionUsd) : undefined}
        />
      </div>

      <PlayerInsightsSection topGames={topGames} topProviders={topProviders} bigWins={bigWins} />

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="No activity yet"
              description="Player events will appear here as the player engages with the platform."
            />
          ) : (
            <ActivityFeed
              items={activity.map(
                (a): ActivityFeedItem => ({
                  id: a.id,
                  timestamp: a.createdAt,
                  title: prettyEventName(a.eventName),
                  description: a.amount
                    ? `${formatCoins(a.amount)} ${a.currency ?? ''}`
                    : a.eventCategory,
                  icon: iconForEventCategory(a.eventCategory),
                }),
              )}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent purchases</CardTitle>
          </CardHeader>
          <CardContent>
            {purchases.length === 0 ? (
              <p className="text-sm text-ink-tertiary">No purchases yet.</p>
            ) : (
              <PurchaseMiniTable rows={purchases.slice(0, 5)} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent redemptions</CardTitle>
          </CardHeader>
          <CardContent>
            {redemptions.length === 0 ? (
              <p className="text-sm text-ink-tertiary">No redemptions yet.</p>
            ) : (
              <RedemptionMiniTable rows={redemptions.slice(0, 5)} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function WalletsTab({ player }: { player: DetailJsonPlayer }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>SC wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueGrid items={walletItems(player.walletSc)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>GC wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueGrid items={walletItems(player.walletGc)} />
        </CardContent>
      </Card>
    </div>
  )
}

function TransactionsTab({
  purchases,
  redemptions,
}: {
  purchases: PurchaseJson[]
  redemptions: RedemptionJson[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="text-sm text-ink-tertiary">No purchases.</p>
          ) : (
            <PurchaseMiniTable rows={purchases} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Redemptions</CardTitle>
        </CardHeader>
        <CardContent>
          {redemptions.length === 0 ? (
            <p className="text-sm text-ink-tertiary">No redemptions.</p>
          ) : (
            <RedemptionMiniTable rows={redemptions} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GameActivityTab({
  rows,
  summary,
}: {
  rows: GameActivityJson[]
  summary: GameActivitySummaryJson
}) {
  const [currency, setCurrency] = React.useState<'all' | 'GC' | 'SC'>('all')
  const [direction, setDirection] = React.useState<'all' | 'bet' | 'win'>('all')
  const [search, setSearch] = React.useState('')

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (currency !== 'all' && r.currency !== currency) return false
      if (direction !== 'all' && r.source !== direction) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const haystack = [r.gameName, r.providerName, r.roundId, r.sessionId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [rows, currency, direction, search])

  const netSc = BigInt(summary.netSc)

  return (
    <div className="flex flex-col gap-5">
      <QuickInsights
        insights={[
          {
            label: 'Lifetime bets',
            value: formatCompactInt(summary.totalBets),
            tone: 'neutral',
          },
          {
            label: 'Lifetime wins',
            value: formatCompactInt(summary.totalWins),
            tone: 'positive',
          },
          {
            label: 'SC wagered',
            value: `${formatCompactCoins(summary.scWagered)} SC`,
            tone: 'neutral',
          },
          {
            label: 'Net SC position',
            value: `${formatCompactCoins(summary.netSc)} SC`,
            tone: netSc >= 0n ? 'positive' : 'critical',
          },
          {
            label: 'Favorite game',
            value: summary.favoriteGame ? summary.favoriteGame.name : '—',
            delta: summary.favoriteGame ? `${summary.favoriteGame.plays} plays` : undefined,
            tone: 'positive',
          },
        ]}
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search game, round, session…"
              className="h-9 flex-1 min-w-[220px] rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'all' | 'GC' | 'SC')}
              className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
            >
              <option value="all">All currencies</option>
              <option value="SC">SC</option>
              <option value="GC">GC</option>
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'all' | 'bet' | 'win')}
              className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
            >
              <option value="all">Bets &amp; wins</option>
              <option value="bet">Bets only</option>
              <option value="win">Wins only</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Gamepad2 />}
              title="No game activity"
              description={
                rows.length === 0
                  ? 'This player hasn\u2019t placed any bets yet.'
                  : 'No rows match the current filters.'
              }
            />
          ) : (
            <>
              {/*
                Cap the table at ~10 rows of visible scroll. Without this the
                widget grows to the full preview height (100 rows) and feels
                like the only thing on the page. The sticky header keeps
                column labels in view as the admin scans.
              */}
              <div className="max-h-[480px] overflow-y-auto rounded-md border border-line-subtle">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-line-subtle text-left font-medium uppercase tracking-wide text-ink-tertiary">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Game</th>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Round</th>
                      <th className="px-3 py-2">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-line-subtle last:border-b-0 hover:bg-surface-hover"
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-ink-secondary">
                          {shortTime(r.createdAt)}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 py-1.5 text-ink-primary"
                          title={r.gameName ?? undefined}
                        >
                          {r.gameName ?? <span className="text-ink-tertiary">—</span>}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-1.5 text-ink-secondary"
                          title={r.providerName ?? undefined}
                        >
                          {r.providerName ?? <span className="text-ink-tertiary">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.source === 'bet' ? (
                            <StatusPill status="custom" color="neutral" label="Bet" />
                          ) : (
                            <StatusPill status="custom" color="positive" label="Win" />
                          )}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-ink-primary"
                          title={`${formatCoins(r.amount)} ${r.currency}`}
                        >
                          {formatCompactCoins(r.amount)}{' '}
                          <span className="text-ink-tertiary">{r.currency}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[10px] text-ink-tertiary">
                          {r.roundId ? r.roundId.slice(0, 10) : '—'}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[10px] text-ink-tertiary">
                          {r.sessionId ? r.sessionId.slice(0, 8) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-ink-tertiary">
                Showing {filtered.length.toLocaleString()} of last {rows.length.toLocaleString()}{' '}
                game ledger entries. Scroll inside the table for older activity.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BonusesTab({ bonuses }: { bonuses: BonusJson[] }) {
  if (bonuses.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Gift />}
            title="No bonuses yet"
            description="Manually award one from Quick Actions, or wait for a bonus event."
          />
        </CardContent>
      </Card>
    )
  }
  const active = bonuses.filter((b) => b.status === 'active')
  const past = bonuses.filter((b) => b.status !== 'active')
  return (
    <div className="flex flex-col gap-4">
      {active.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Active bonuses</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {active.map((b) => (
              <BonusRow key={b.id} bonus={b} />
            ))}
          </CardContent>
        </Card>
      ) : null}
      {past.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {past.map((b) => (
              <BonusRow key={b.id} bonus={b} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function SessionsTab({ sessions }: { sessions: SessionJson[] }) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No active sessions" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
              <th className="py-2 pr-3">IP</th>
              <th className="py-2 pr-3">User agent</th>
              <th className="py-2 pr-3">Started</th>
              <th className="py-2">Expires</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-line-subtle last:border-b-0">
                <td className="py-2.5 pr-3 text-sm text-ink-primary">{s.ip ?? '—'}</td>
                <td className="max-w-md truncate py-2.5 pr-3 text-sm text-ink-secondary">
                  {s.userAgent ?? '—'}
                </td>
                <td className="py-2.5 pr-3 text-sm text-ink-secondary">{shortTime(s.createdAt)}</td>
                <td className="py-2.5 text-sm text-ink-secondary">{shortTime(s.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function NotesTab({ notes, playerId: _playerId }: { notes: NoteJson[]; playerId: string }) {
  if (notes.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No notes yet"
            description="Add the first note from Quick Actions on the right."
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notes.map((n) => (
          <article key={n.id} className="rounded-md border border-line-subtle bg-base p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-ink-tertiary">
              <span>{n.actorRole ?? 'admin'}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={n.occurredAt}>{shortTime(n.occurredAt)}</time>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-primary">{n.note}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  )
}

function AuditTab({ audit }: { audit: AuditJson[] }) {
  if (audit.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No admin actions on this player yet." />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Actor</th>
              <th className="py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} className="border-b border-line-subtle last:border-b-0">
                <td className="py-2.5 pr-3 text-sm text-ink-secondary">
                  {shortTime(a.occurredAt)}
                </td>
                <td className="py-2.5 pr-3 text-sm font-medium text-ink-primary">{a.action}</td>
                <td className="py-2.5 pr-3 text-sm text-ink-secondary">{a.actorRole ?? '—'}</td>
                <td className="py-2.5 text-sm text-ink-secondary">{a.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function PurchaseMiniTable({ rows }: { rows: PurchaseJson[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
          <th className="py-2 pr-3">When</th>
          <th className="py-2 pr-3">Method</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pl-3 text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-line-subtle last:border-b-0">
            <td className="py-2.5 pr-3 text-sm text-ink-secondary">{shortTime(p.createdAt)}</td>
            <td className="py-2.5 pr-3 text-sm text-ink-primary">
              {p.cardBrand ? `${p.cardBrand} ···· ${p.cardLast4 ?? '****'}` : '—'}
            </td>
            <td className="py-2.5 pr-3">
              <StatusPill
                status={p.status === 'completed' ? 'completed' : 'custom'}
                color={p.status === 'failed' ? 'critical' : 'attention'}
                label={p.status}
              />
            </td>
            <td className="py-2.5 pl-3 text-right text-sm tabular-nums text-ink-primary">
              {formatUsd(p.amountUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RedemptionMiniTable({ rows }: { rows: RedemptionJson[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
          <th className="py-2 pr-3">When</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3 text-right">SC</th>
          <th className="py-2 pl-3 text-right">USD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line-subtle last:border-b-0">
            <td className="py-2.5 pr-3 text-sm text-ink-secondary">{shortTime(r.createdAt)}</td>
            <td className="py-2.5 pr-3">{redemptionStatusPill(r.status)}</td>
            <td className="py-2.5 pr-3 text-right text-sm tabular-nums text-ink-secondary">
              {formatCoins(r.amountSc)}
            </td>
            <td className="py-2.5 pl-3 text-right text-sm tabular-nums text-ink-primary">
              {formatUsd(r.amountUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BonusRow({ bonus }: { bonus: BonusJson }) {
  const required = BigInt(bonus.playthroughRequired)
  const progress = BigInt(bonus.playthroughProgress)
  const pct = required > 0n ? Number((progress * 100n) / required) : 100
  return (
    <div className="rounded-md border border-line-subtle bg-base p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink-primary">{bonus.bonusName}</div>
          <div className="text-xs text-ink-tertiary">{bonus.bonusType.replace(/_/g, ' ')}</div>
        </div>
        <div className="text-right">
          <div className="text-sm tabular-nums text-ink-primary">
            {formatCoins(bonus.scAmount)} <span className="text-ink-tertiary">SC</span>
          </div>
          <div className="text-xs tabular-nums text-ink-tertiary">
            {formatCoins(bonus.gcAmount)} GC
          </div>
        </div>
      </div>
      {bonus.status === 'active' ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-ink-tertiary">
            <span>Playthrough</span>
            <span>
              {formatCoins(progress.toString())} / {formatCoins(required.toString())} SC ({pct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function walletItems(w: WalletJson) {
  return [
    { label: 'Current balance', value: `${formatCoins(w.currentBalance)} ${w.currency}` },
    { label: 'Purchased', value: formatCoins(w.balancePurchased) },
    { label: 'Bonus', value: formatCoins(w.balanceBonus) },
    { label: 'Promo', value: formatCoins(w.balancePromo) },
    { label: 'Earned', value: formatCoins(w.balanceEarned) },
  ]
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`
}

function prettyEventName(name: string): string {
  return name.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function iconForEventCategory(category: string): React.ReactNode {
  if (category === 'wager' || category === 'play') return <Coins />
  if (category === 'win') return <ArrowUpRight />
  if (category === 'loss') return <ArrowDownRight />
  if (category === 'bonus') return <Gift />
  if (category === 'compliance') return <AlertTriangle />
  return <Activity />
}

function redemptionStatusPill(status: string) {
  switch (status) {
    case 'paid':
      return <StatusPill status="paid" />
    case 'approved':
      return <StatusPill status="approved" />
    case 'rejected':
      return <StatusPill status="rejected" />
    case 'cancelled':
      return <StatusPill status="cancelled" />
    case 'pending_review':
      return <StatusPill status="custom" color="attention" label="Pending review" />
    case 'kyc_pending':
      return <StatusPill status="kyc-pending" />
    case 'submitted':
      return <StatusPill status="submitted" />
    case 'requested':
      return <StatusPill status="requested" />
    case 'aml_hold':
      return <StatusPill status="custom" color="critical" label="AML hold" />
    default:
      return <StatusPill status="custom" color="neutral" label={status} />
  }
}

/* -------------------------------------------------------------------------- */
/* Player Insights — top games, top providers, recent big wins                 */
/* -------------------------------------------------------------------------- */

function PlayerInsightsSection({
  topGames,
  topProviders,
  bigWins,
}: {
  topGames: TopGameJson[]
  topProviders: TopProviderJson[]
  bigWins: BigWinJson[]
}) {
  return (
    <section aria-labelledby="player-insights">
      <h2
        id="player-insights"
        className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary"
      >
        Player insights
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InsightPanel title="Top 3 games" icon={<Gamepad2 className="h-4 w-4" />}>
          {topGames.length === 0 ? (
            <InsightEmpty text="No SC bets yet — once the player wagers, this panel populates." />
          ) : (
            <ul className="flex flex-col gap-3">
              {topGames.map((g, i) => (
                <li key={g.gameId} className="flex flex-col gap-1 text-sm">
                  <Link
                    href={`/admin/casino/games/${g.gameId}`}
                    className="block min-w-0 truncate font-medium text-ink-primary hover:text-brand"
                    title={g.gameName}
                  >
                    <span className="text-ink-tertiary">{i + 1}.</span> {g.gameName}
                  </Link>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <span className="text-ink-secondary">
                      {formatCompactInt(g.playCount)} plays
                    </span>
                    <span
                      className={BigInt(g.ggrSc) >= 0n ? 'text-positive' : 'text-critical'}
                      title={`${formatCoins(g.ggrSc)} SC GGR`}
                    >
                      {formatCompactCoins(g.ggrSc)} SC GGR
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </InsightPanel>

        <InsightPanel title="Top 3 providers" icon={<Building2 className="h-4 w-4" />}>
          {topProviders.length === 0 ? (
            <InsightEmpty text="No provider activity yet for this player." />
          ) : (
            <ul className="flex flex-col gap-3">
              {topProviders.map((p, i) => (
                <li key={p.providerId} className="flex flex-col gap-1 text-sm">
                  <Link
                    href={`/admin/casino/providers/${p.providerId}`}
                    className="block min-w-0 truncate font-medium text-ink-primary hover:text-brand"
                    title={p.providerName}
                  >
                    <span className="text-ink-tertiary">{i + 1}.</span> {p.providerName}
                  </Link>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <span className="text-ink-secondary">{formatCompactInt(p.betCount)} bets</span>
                    <span
                      className="text-ink-primary"
                      title={`${formatCoins(p.scWagered)} SC wagered`}
                    >
                      {formatCompactCoins(p.scWagered)} SC
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </InsightPanel>

        <InsightPanel title="Recent big wins" icon={<Trophy className="h-4 w-4" />}>
          {bigWins.length === 0 ? (
            <InsightEmpty text="No big wins yet — comes alive once the player hits a 100 SC+ payout." />
          ) : (
            <ul className="flex flex-col gap-3">
              {bigWins.map((w) => (
                <li key={w.id} className="flex flex-col gap-1 text-sm">
                  <span
                    className="block min-w-0 truncate font-medium text-ink-primary"
                    title={w.gameName ?? undefined}
                  >
                    {w.gameName ?? <span className="text-ink-tertiary">Unknown game</span>}
                  </span>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <span className="text-positive" title={`${formatCoins(w.amountSc)} SC`}>
                      <Sparkles className="mr-0.5 inline h-3.5 w-3.5 align-text-bottom" />
                      {formatCompactCoins(w.amountSc)} SC
                    </span>
                    <span className="text-ink-tertiary">{shortDate(w.occurredAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </InsightPanel>
      </div>
    </section>
  )
}

function InsightPanel({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
        <span className="text-ink-secondary">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

function InsightEmpty({ text }: { text: string }) {
  return <p className="text-sm text-ink-tertiary">{text}</p>
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function computeAverageWager(summary: GameActivitySummaryJson): string | null {
  if (summary.totalBets === 0) return null
  const wagered = BigInt(summary.scWagered)
  const avg = wagered / BigInt(summary.totalBets)
  return avg.toString()
}

/**
 * Parses a numeric USD/coin string and returns -1/0/+1. Used to pick a tile
 * tone for net-position widgets. Handles minor-unit integer strings and
 * `numeric(20,4)` decimal strings interchangeably.
 */
function netPositionSign(value: string): number {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '0' || /^-?0+(\.0+)?$/.test(trimmed)) return 0
  return trimmed.startsWith('-') ? -1 : 1
}

// Re-export Link type so caller knows the route surface.
export const PLAYER_DETAIL_PATH = (id: string) => `/admin/players/${id}` as const
export const _Link = Link
