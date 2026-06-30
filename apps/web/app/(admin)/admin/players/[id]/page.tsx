import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDownRight, ArrowUpRight, EyeOff } from 'lucide-react'

import { canManageVipAssignments, hasAtLeast } from '@coinfrenzy/core/auth'
import {
  DetailLayout,
  HostBadge,
  KeyValueGrid,
  PageHeader,
  StatusPill,
  VipBadge,
} from '@coinfrenzy/ui/admin'
import { Avatar, AvatarFallback } from '@coinfrenzy/ui/primitives/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins, formatCompactUsd, formatUsd } from '@/lib/format'

import { ActionDialogs } from './_action-dialogs'
import {
  fetchMessageTemplates,
  fetchPlayerActivity,
  fetchPlayerAuditEntries,
  fetchPlayerBigWins,
  fetchPlayerBonuses,
  fetchPlayerDetail,
  fetchPlayerGameActivity,
  fetchPlayerNotes,
  fetchPlayerPurchases,
  fetchPlayerRedemptions,
  fetchPlayerSessions,
  fetchPlayerTopGames,
  fetchPlayerTopProviders,
} from './_data'
import {
  PlayerDetailClient,
  type ActivityJson,
  type AuditJson,
  type BigWinJson,
  type BonusJson,
  type DetailJsonPlayer,
  type GameActivityJson,
  type GameActivitySummaryJson,
  type NoteJson,
  type PurchaseJson,
  type RedemptionJson,
  type SessionJson,
  type TopGameJson,
  type TopProviderJson,
  type WalletJson,
} from './player-detail-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PlayerDetailPage({ params }: PageProps) {
  const session = await requireAdminSession()
  const { id } = await params

  const player = await fetchPlayerDetail(id)
  if (!player) notFound()

  const [
    purchases,
    redemptions,
    bonuses,
    sessions,
    audit,
    notes,
    activity,
    gameActivity,
    topGames,
    topProviders,
    bigWins,
    templates,
  ] = await Promise.all([
    fetchPlayerPurchases(id, 25),
    fetchPlayerRedemptions(id, 25),
    fetchPlayerBonuses(id, 25),
    fetchPlayerSessions(id),
    fetchPlayerAuditEntries(id, 100),
    fetchPlayerNotes(id),
    fetchPlayerActivity(id, 25),
    fetchPlayerGameActivity(id, 100),
    fetchPlayerTopGames(id, 3),
    fetchPlayerTopProviders(id, 3),
    fetchPlayerBigWins(id),
    fetchMessageTemplates(),
  ])

  const role = session.payload.role
  const canManage = hasAtLeast(role, 'manager')
  const canMaster = role === 'master'
  const canVipManage = canManageVipAssignments(role)

  const playerJson = serializePlayer(player)
  const initials = initialsFor(player.displayName ?? player.username ?? player.email)

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={player.email}
        subtitle={player.username ?? player.displayName ?? undefined}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Players', href: '/admin/players' },
          { label: player.email },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <DetailLayout
        primary={
          <div className="flex flex-col gap-6">
            <PlayerHeaderBlock player={playerJson} initials={initials} />
            <ActionDialogs
              variant="bar"
              playerId={player.id}
              playerEmail={player.email}
              playerHasPhone={Boolean(player.phone)}
              currentStatus={player.status}
              editable={{
                email: player.email,
                username: player.username,
                displayName: player.displayName,
                firstName: player.firstName,
                lastName: player.lastName,
                phone: player.phone,
                state: player.state,
                emailConsent: player.emailConsent,
                smsConsent: player.smsConsent,
                kycLevel: player.kycLevel,
                stealthLocked: player.stealthLocked,
              }}
              canManage={canManage}
              canMaster={canMaster}
              emailTemplates={templates.email}
              smsTemplates={templates.sms}
            />
            <PlayerDetailClient
              player={playerJson}
              purchases={purchases.map(serializePurchase)}
              redemptions={redemptions.map(serializeRedemption)}
              bonuses={bonuses.map(serializeBonus)}
              sessions={sessions.map(serializeSession)}
              audit={audit.map(serializeAudit)}
              notes={notes.map(serializeNote)}
              activity={activity.map(serializeActivity)}
              gameActivity={gameActivity.rows.map(serializeGameActivity)}
              gameActivitySummary={serializeGameActivitySummary(gameActivity.summary)}
              topGames={topGames.map(serializeTopGame)}
              topProviders={topProviders.map(serializeTopProvider)}
              bigWins={bigWins.map(serializeBigWin)}
            />
          </div>
        }
        sidebar={
          <>
            <WalletSummaryCard player={player} />
            <NetPositionCard player={player} />
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Email', value: <span className="break-all">{player.email}</span> },
                    { label: 'Username', value: player.username ?? '—' },
                    { label: 'Phone', value: player.phone ?? '—' },
                    {
                      label: 'Registered',
                      value: new Date(player.firstSeenAt).toLocaleDateString(),
                    },
                    { label: 'Signup state', value: player.signupState ?? '—' },
                    { label: 'Current state', value: player.state ?? '—' },
                    { label: 'Email opt-in', value: player.emailConsent ? 'Yes' : 'No' },
                    { label: 'SMS opt-in', value: player.smsConsent ? 'Yes' : 'No' },
                  ]}
                />
                {player.stealthLocked ? (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-critical/30 bg-critical/5 p-2.5 text-xs text-critical">
                    <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div className="font-medium">Stealth lock engaged</div>
                      <div className="text-ink-tertiary">
                        {player.stealthLockReason ?? 'No reason recorded'} ·{' '}
                        {player.stealthLockedAt
                          ? new Date(player.stealthLockedAt).toLocaleDateString()
                          : ''}
                      </div>
                    </div>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-ink-tertiary">
                  Use <span className="text-ink-secondary">Edit Account</span> in the action bar to
                  change any field.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    {
                      label: 'KYC level',
                      value: (
                        <StatusPill
                          status="custom"
                          color={player.kycLevel >= 2 ? 'positive' : 'attention'}
                          label={`L${player.kycLevel}`}
                        />
                      ),
                    },
                    {
                      label: 'KYC verified',
                      value: player.kycVerifiedAt
                        ? new Date(player.kycVerifiedAt).toLocaleDateString()
                        : '—',
                    },
                    {
                      label: 'Self-exclusion',
                      value: player.rgSelfExcludedUntil
                        ? `until ${new Date(player.rgSelfExcludedUntil).toLocaleDateString()}`
                        : '—',
                    },
                    {
                      label: '2FA',
                      value: player.twoFactorEnabled ? 'Enabled' : 'Disabled',
                    },
                  ]}
                />
                <p className="mt-3 text-xs text-ink-tertiary">
                  Override KYC level or send a password reset from the{' '}
                  <span className="text-ink-secondary">More</span> menu in the action bar.
                </p>
              </CardContent>
            </Card>

            {player.vip.status !== 'none' || player.vip.assignedHostId ? (
              <Card>
                <CardHeader>
                  <CardTitle>VIP / Host</CardTitle>
                </CardHeader>
                <CardContent>
                  <KeyValueGrid
                    items={[
                      {
                        label: 'Status',
                        value: <VipBadge status={player.vip.status} />,
                      },
                      {
                        label: 'Qualified',
                        value: player.vip.qualifiedAt
                          ? new Date(player.vip.qualifiedAt).toLocaleDateString()
                          : '—',
                      },
                      {
                        label: 'Host',
                        value: (
                          <HostBadge
                            host={
                              player.vip.assignedHostId
                                ? {
                                    id: player.vip.assignedHostId,
                                    displayName: player.vip.hostDisplayName ?? '—',
                                  }
                                : null
                            }
                            renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
                          />
                        ),
                      },
                      {
                        label: 'Assigned',
                        value: player.vip.hostAssignedAt
                          ? new Date(player.vip.hostAssignedAt).toLocaleDateString()
                          : '—',
                      },
                    ]}
                  />
                  {canVipManage ? (
                    <div className="mt-4 flex flex-col gap-2">
                      <Link
                        href={`/admin/vip/${player.id}`}
                        className="rounded-md border border-line-subtle bg-surface px-3 py-1.5 text-center text-xs font-medium text-ink-primary hover:bg-surface-hover"
                      >
                        Open VIP detail
                      </Link>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </>
        }
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sidebar — wallet summary + net position cards                                */
/* -------------------------------------------------------------------------- */

function WalletSummaryCard({
  player,
}: {
  player: Awaited<ReturnType<typeof fetchPlayerDetail>> & object
}) {
  const sc = player.walletSc
  const gc = player.walletGc
  // Bucket grouping for the player surface (docs/06 §11.4):
  //   Purchased        — cash-redeemable instantly; drains LAST
  //   In playthrough   — bonus + promo, NOT redeemable yet
  //   Redeemable       — bonus SC released after playthrough complete
  const inPlaythrough = sc.balanceBonus + sc.balancePromo
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
            Total SC balance
          </div>
          <div
            className="truncate text-2xl font-semibold tabular-nums tracking-tight text-ink-primary"
            title={`${formatCoins(sc.currentBalance.toString())} SC`}
          >
            {formatCoins(sc.currentBalance.toString())}{' '}
            <span className="text-md text-ink-tertiary">SC</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-md border border-line-subtle bg-base p-3">
          <SubBucketRow
            label="Purchased"
            sublabel="1× playthrough · cash-redeemable"
            value={sc.balancePurchased}
          />
          <SubBucketRow
            label="Bonus"
            sublabel="3× playthrough · locked"
            value={inPlaythrough}
            tone="attention"
          />
          <SubBucketRow
            label="Redeemable"
            sublabel="no playthrough · withdraw any time"
            value={sc.balanceEarned}
            tone="positive"
          />
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-line-subtle pt-3 text-xs">
          <span className="text-ink-tertiary">GC balance</span>
          <span
            className="truncate tabular-nums text-ink-secondary"
            title={`${formatCoins(gc.currentBalance.toString())} GC`}
          >
            {formatCoins(gc.currentBalance.toString())} GC
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function SubBucketRow({
  label,
  sublabel,
  value,
  tone = 'neutral',
}: {
  label: string
  sublabel: string
  value: bigint
  tone?: 'neutral' | 'positive' | 'attention'
}) {
  const valueCls =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'attention'
        ? 'text-attention'
        : 'text-ink-primary'
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium text-ink-primary">{label}</div>
        <div className="truncate text-[11px] text-ink-tertiary">{sublabel}</div>
      </div>
      <div
        className={`shrink-0 truncate text-right tabular-nums ${valueCls}`}
        title={`${formatCoins(value.toString())} SC`}
      >
        {formatCoins(value.toString())}
      </div>
    </div>
  )
}

function NetPositionCard({
  player,
}: {
  player: Awaited<ReturnType<typeof fetchPlayerDetail>> & object
}) {
  const lt = player.lifetime
  if (!lt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Operator net position</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-tertiary">No purchases or redemptions yet.</p>
        </CardContent>
      </Card>
    )
  }
  const net = lt.netPositionUsd
  const isPositive = net >= 0n
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight
  const toneCls = isPositive
    ? 'border-positive/30 bg-positive/5 text-positive'
    : 'border-critical/30 bg-critical/5 text-critical'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operator net position</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-secondary">Total purchases</span>
          <span
            className="truncate tabular-nums text-ink-primary"
            title={formatUsd(lt.totalDepositedUsd.toString())}
          >
            {formatCompactUsd(lt.totalDepositedUsd.toString())}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-ink-secondary">Total redemptions</span>
          <span
            className="truncate tabular-nums text-ink-primary"
            title={formatUsd(lt.totalRedeemedUsd.toString())}
          >
            {formatCompactUsd(lt.totalRedeemedUsd.toString())}
          </span>
        </div>
        <div
          className={`mt-1 flex items-baseline justify-between gap-2 rounded-md border px-3 py-2 ${toneCls}`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
            <TrendIcon className="h-3.5 w-3.5" />
            Net position
          </span>
          <span
            className="truncate text-lg font-semibold tabular-nums"
            title={formatUsd(net.toString())}
          >
            {isPositive ? '+' : ''}
            {formatCompactUsd(net.toString())}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-xs text-ink-tertiary">
          <span>{lt.purchaseCount.toLocaleString()} purchases</span>
          <span>{lt.redemptionCount.toLocaleString()} redemptions</span>
        </div>
      </CardContent>
    </Card>
  )
}

function PlayerHeaderBlock({ player, initials }: { player: DetailJsonPlayer; initials: string }) {
  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-14 w-14">
        <AvatarFallback className="bg-elevated text-md font-medium text-ink-secondary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink-primary">
            {player.displayName ?? player.email}
          </h2>
          {statusPillFor(player.status)}
          <StatusPill
            status="custom"
            color={player.kycLevel >= 2 ? 'positive' : 'attention'}
            label={`KYC L${player.kycLevel}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-tertiary">
          <span className="font-mono">{player.id}</span>
          <span aria-hidden="true">·</span>
          <span>{player.email}</span>
          {player.statusReason ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-critical">Reason: {player.statusReason}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Serializers — bigint → string for Server → Client                            */
/* -------------------------------------------------------------------------- */

function serializePlayer(p: Awaited<ReturnType<typeof fetchPlayerDetail>>): DetailJsonPlayer {
  if (!p) throw new Error('serializePlayer called with null')
  return {
    id: p.id,
    email: p.email,
    username: p.username,
    displayName: p.displayName,
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    state: p.state,
    signupState: p.signupState,
    status: p.status,
    statusReason: p.statusReason,
    kycLevel: p.kycLevel,
    kycVerifiedAt: p.kycVerifiedAt,
    emailConsent: p.emailConsent,
    smsConsent: p.smsConsent,
    twoFactorEnabled: p.twoFactorEnabled,
    rgSelfExcludedUntil: p.rgSelfExcludedUntil,
    firstSeenAt: p.firstSeenAt,
    lastSeenAt: p.lastSeenAt,
    lastLoginAt: p.lastLoginAt,
    walletGc: serializeWallet(p.walletGc),
    walletSc: serializeWallet(p.walletSc),
    lifetime: p.lifetime
      ? {
          totalDepositedUsd: p.lifetime.totalDepositedUsd.toString(),
          totalRedeemedUsd: p.lifetime.totalRedeemedUsd.toString(),
          netPositionUsd: p.lifetime.netPositionUsd.toString(),
          purchaseCount: p.lifetime.purchaseCount,
          redemptionCount: p.lifetime.redemptionCount,
          totalWageredSc: p.lifetime.totalWageredSc.toString(),
          totalWonSc: p.lifetime.totalWonSc.toString(),
          ggrSc: p.lifetime.ggrSc.toString(),
          daysActive: p.lifetime.daysActive,
        }
      : null,
  }
}

function serializeWallet(w: {
  currency: 'GC' | 'SC'
  currentBalance: bigint
  balancePurchased: bigint
  balanceBonus: bigint
  balancePromo: bigint
  balanceEarned: bigint
}): WalletJson {
  return {
    currency: w.currency,
    currentBalance: w.currentBalance.toString(),
    balancePurchased: w.balancePurchased.toString(),
    balanceBonus: w.balanceBonus.toString(),
    balancePromo: w.balancePromo.toString(),
    balanceEarned: w.balanceEarned.toString(),
  }
}

function serializePurchase(
  p: Awaited<ReturnType<typeof fetchPlayerPurchases>>[number],
): PurchaseJson {
  return {
    id: p.id,
    amountUsd: p.amountUsd.toString(),
    status: p.status,
    cardBrand: p.cardBrand,
    cardLast4: p.cardLast4,
    createdAt: p.createdAt,
  }
}

function serializeRedemption(
  r: Awaited<ReturnType<typeof fetchPlayerRedemptions>>[number],
): RedemptionJson {
  return {
    id: r.id,
    amountUsd: r.amountUsd.toString(),
    amountSc: r.amountSc.toString(),
    status: r.status,
    createdAt: r.createdAt,
    paidAt: r.paidAt,
  }
}

function serializeBonus(b: Awaited<ReturnType<typeof fetchPlayerBonuses>>[number]): BonusJson {
  return {
    id: b.id,
    bonusName: b.bonusName,
    bonusType: b.bonusType,
    scAmount: b.scAmount.toString(),
    gcAmount: b.gcAmount.toString(),
    playthroughRequired: b.playthroughRequired.toString(),
    playthroughProgress: b.playthroughProgress.toString(),
    playthroughComplete: b.playthroughComplete,
    status: b.status,
    expiresAt: b.expiresAt,
    createdAt: b.createdAt,
  }
}

function serializeSession(s: Awaited<ReturnType<typeof fetchPlayerSessions>>[number]): SessionJson {
  return {
    id: s.id,
    ip: s.ip,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }
}

function serializeAudit(a: Awaited<ReturnType<typeof fetchPlayerAuditEntries>>[number]): AuditJson {
  return {
    id: a.id,
    action: a.action,
    actorId: a.actorId,
    actorRole: a.actorRole,
    reason: a.reason,
    occurredAt: a.occurredAt,
  }
}

function serializeNote(n: Awaited<ReturnType<typeof fetchPlayerNotes>>[number]): NoteJson {
  return {
    id: n.id,
    occurredAt: n.occurredAt,
    actorId: n.actorId,
    actorRole: n.actorRole,
    note: n.note,
  }
}

function serializeActivity(
  a: Awaited<ReturnType<typeof fetchPlayerActivity>>[number],
): ActivityJson {
  return {
    id: a.id,
    eventName: a.eventName,
    eventCategory: a.eventCategory,
    amount: a.amount?.toString() ?? null,
    currency: a.currency,
    createdAt: a.createdAt,
  }
}

function serializeGameActivity(
  r: Awaited<ReturnType<typeof fetchPlayerGameActivity>>['rows'][number],
): GameActivityJson {
  return {
    id: r.id,
    pairId: r.pairId,
    source: r.source,
    amount: r.amount.toString(),
    currency: r.currency,
    createdAt: r.createdAt,
    gameId: r.gameId,
    gameName: r.gameName,
    providerName: r.providerName,
    roundId: r.roundId,
    sessionId: r.sessionId,
  }
}

function serializeGameActivitySummary(
  s: Awaited<ReturnType<typeof fetchPlayerGameActivity>>['summary'],
): GameActivitySummaryJson {
  return {
    totalBets: s.totalBets,
    totalWins: s.totalWins,
    scWagered: s.scWagered.toString(),
    scWon: s.scWon.toString(),
    netSc: s.netSc.toString(),
    favoriteGame: s.favoriteGame,
  }
}

function serializeTopGame(g: Awaited<ReturnType<typeof fetchPlayerTopGames>>[number]): TopGameJson {
  return {
    gameId: g.gameId,
    gameName: g.gameName,
    playCount: g.playCount,
    ggrSc: g.ggrSc.toString(),
  }
}

function serializeTopProvider(
  p: Awaited<ReturnType<typeof fetchPlayerTopProviders>>[number],
): TopProviderJson {
  return {
    providerId: p.providerId,
    providerName: p.providerName,
    betCount: p.betCount,
    scWagered: p.scWagered.toString(),
  }
}

function serializeBigWin(w: Awaited<ReturnType<typeof fetchPlayerBigWins>>[number]): BigWinJson {
  return {
    id: w.id,
    gameName: w.gameName,
    amountSc: w.amountSc.toString(),
    occurredAt: w.occurredAt,
  }
}

function statusPillFor(status: string) {
  switch (status) {
    case 'active':
      return <StatusPill status="active" />
    case 'suspended':
      return <StatusPill status="suspended" />
    case 'self_excluded':
      return <StatusPill status="self-excluded" />
    case 'closed':
      return <StatusPill status="closed" />
    default:
      return <StatusPill status="custom" color="neutral" label={status} />
  }
}

function initialsFor(text: string): string {
  const cleaned = text.replace(/[^a-z0-9 ]/gi, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
