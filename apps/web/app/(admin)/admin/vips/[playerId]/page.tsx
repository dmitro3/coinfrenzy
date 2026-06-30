import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { Calendar, GamepadIcon, ShieldCheck, Wallet } from 'lucide-react'

import { isHost } from '@coinfrenzy/core/auth'
import { noopLogger, vip as vipModule } from '@coinfrenzy/core'
import {
  DetailLayout,
  KeyValueGrid,
  PageHeader,
  QuickInsights,
  VipBadge,
  type VipStatus,
} from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins, formatUsd } from '@/lib/format'

import { HostVipActions } from './_host-vip-actions'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ playerId: string }>
}

export default async function HostVipDetailPage({ params }: PageProps) {
  const session = await requireAdminSession()
  if (!isHost(session.payload.role)) {
    redirect('/admin/vip/all-vips')
  }

  const { playerId } = await params
  const hostId = session.admin.id
  const db = getDb()

  // SECURITY: hosts can only see their own VIPs. Enforce at query time.
  const playerRows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      phone: schema.players.phone,
      state: schema.players.state,
      kycLevel: schema.players.kycLevel,
      vipStatus: schema.players.vipStatus,
      vipQualifiedAt: schema.players.vipQualifiedAt,
      hostAssignedAt: schema.players.hostAssignedAt,
      lastSeenAt: schema.players.lastSeenAt,
      firstSeenAt: schema.players.firstSeenAt,
    })
    .from(schema.players)
    .where(and(eq(schema.players.id, playerId), eq(schema.players.assignedHostId, hostId)))
    .limit(1)
  const player = playerRows[0]
  if (!player) notFound()

  const [lifetime] = await db
    .select({
      totalDepositedUsd: schema.playerLifetimeStats.totalDepositedUsd,
      totalRedeemedUsd: schema.playerLifetimeStats.totalRedeemedUsd,
      purchaseCount: schema.playerLifetimeStats.purchaseCount,
      redemptionCount: schema.playerLifetimeStats.redemptionCount,
      totalWageredSc: schema.playerLifetimeStats.totalWageredSc,
      totalWonSc: schema.playerLifetimeStats.totalWonSc,
      sessionCount: schema.playerLifetimeStats.sessionCount,
      lastSessionAt: schema.playerLifetimeStats.lastSessionAt,
    })
    .from(schema.playerLifetimeStats)
    .where(eq(schema.playerLifetimeStats.playerId, playerId))
    .limit(1)

  const [wallets] = await db
    .select({
      scCurrentBalance: schema.wallets.currentBalance,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, playerId), eq(schema.wallets.currency, 'SC')))
    .limit(1)

  const interactions = await vipModule.getInteractionHistory(db, playerId, { limit: 50 })
  const budget = await vipModule.getHostWeeklyBonusBudget(
    { db, logger: noopLogger, actor: { kind: 'anonymous' }, reqId: 'page', afterCommit: () => {} },
    hostId,
    playerId,
  )

  // Host-available bonus templates.
  const templates = await db
    .select({
      id: schema.bonuses.id,
      displayName: schema.bonuses.displayName,
      description: schema.bonuses.description,
      awardSc: schema.bonuses.awardSc,
      awardGc: schema.bonuses.awardGc,
    })
    .from(schema.bonuses)
    .where(and(eq(schema.bonuses.hostAvailable, true), eq(schema.bonuses.status, 'active')))

  const lifetimeSpend = lifetime?.totalDepositedUsd ?? 0n

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={player.email}
        subtitle={player.displayName ?? undefined}
        breadcrumb={[
          { label: 'Host Portal', href: '/admin' },
          { label: 'My VIPs', href: '/admin/vips' },
          { label: player.email },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={<VipBadge status={(player.vipStatus as VipStatus) ?? 'none'} />}
      />

      <QuickInsights
        insights={[
          {
            label: 'Lifetime spend',
            value: formatUsd(lifetimeSpend),
            icon: <Wallet />,
            tone: 'neutral',
          },
          {
            label: 'Total wagered',
            value: `${formatCoins(lifetime?.totalWageredSc ?? 0n)} SC`,
            icon: <GamepadIcon />,
            tone: 'neutral',
          },
          {
            label: 'Last seen',
            value: player.lastSeenAt ? relative(player.lastSeenAt) : 'Never',
            icon: <Calendar />,
            tone: 'neutral',
          },
          {
            label: 'Weekly bonus budget left',
            value: `${formatCoins(budget.remainingSc.toString())} SC`,
            tone: budget.remainingSc === 0n ? 'attention' : 'positive',
            icon: <ShieldCheck />,
          },
        ]}
      />

      <DetailLayout
        primary={
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Key facts</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Registered', value: player.firstSeenAt.toLocaleDateString() },
                    { label: 'State', value: player.state ?? '—' },
                    { label: 'KYC level', value: `L${player.kycLevel}` },
                    {
                      label: 'Total purchases',
                      value: (lifetime?.purchaseCount ?? 0).toString(),
                    },
                    {
                      label: 'Total redemptions',
                      value: (lifetime?.redemptionCount ?? 0).toString(),
                    },
                    {
                      label: 'Sessions',
                      value: (lifetime?.sessionCount ?? 0).toString(),
                    },
                    {
                      label: 'VIP qualified',
                      value: player.vipQualifiedAt
                        ? player.vipQualifiedAt.toLocaleDateString()
                        : '—',
                    },
                    {
                      label: 'Assigned to you',
                      value: player.hostAssignedAt
                        ? player.hostAssignedAt.toLocaleDateString()
                        : '—',
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Interactions ({interactions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {interactions.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">
                    No interactions logged yet — log your first touchpoint with the action buttons
                    on the right.
                  </p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {interactions.map((i) => {
                      const channel = (i.metadata as { channel?: string } | null)?.channel
                      return (
                        <li
                          key={i.id}
                          className="rounded-md border border-line-subtle/40 bg-surface px-3 py-2"
                        >
                          <div className="flex items-center justify-between text-xs text-ink-tertiary">
                            <span className="rounded-sm bg-elevated px-1.5 py-0.5 uppercase tracking-wider">
                              {i.interactionType.replace('_', ' ')}
                              {channel ? ` · ${channel.replace('_', ' ')}` : ''}
                            </span>
                            <span>{i.createdAt.toLocaleString()}</span>
                          </div>
                          {i.notes ? <p className="mt-2 text-ink-primary">{i.notes}</p> : null}
                          {i.outcome ? (
                            <p className="mt-1 text-xs text-ink-secondary">Outcome: {i.outcome}</p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        }
        sidebar={
          <>
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Email', value: player.email },
                    { label: 'Phone', value: player.phone ?? '—' },
                    { label: 'State', value: player.state ?? '—' },
                    { label: 'KYC level', value: `L${player.kycLevel}` },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Wallets</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    {
                      label: 'SC balance',
                      value: `${formatCoins(wallets?.scCurrentBalance ?? 0n)} SC`,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <HostVipActions
                  playerId={playerId}
                  playerLabel={player.email}
                  budget={{
                    remainingSc: budget.remainingSc.toString(),
                    capSc: budget.capSc.toString(),
                  }}
                  templates={templates.map((t) => ({
                    id: t.id,
                    displayName: t.displayName,
                    description: t.description,
                    awardSc: t.awardSc.toString(),
                    awardGc: t.awardGc.toString(),
                  }))}
                />
              </CardContent>
            </Card>
          </>
        }
      />
    </div>
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
