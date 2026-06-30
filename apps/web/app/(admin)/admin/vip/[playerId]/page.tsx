import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { canManageVipAssignments, canViewAllVips } from '@coinfrenzy/core/auth'
import { vip as vipModule } from '@coinfrenzy/core'
import {
  DetailLayout,
  HostBadge,
  KeyValueGrid,
  PageHeader,
  VipBadge,
  type VipStatus,
} from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchHostsList } from '../_data'
import { VipReassignButton } from './_reassign-button'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ playerId: string }>
}

export default async function VipDetailPage({ params }: PageProps) {
  const session = await requireAdminSession()
  if (!canViewAllVips(session.payload.role)) {
    redirect('/admin')
  }

  const { playerId } = await params
  const db = getDb()

  const rows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      vipStatus: schema.players.vipStatus,
      vipQualifiedAt: schema.players.vipQualifiedAt,
      assignedHostId: schema.players.assignedHostId,
      hostAssignedAt: schema.players.hostAssignedAt,
      kycLevel: schema.players.kycLevel,
      state: schema.players.state,
      lifetimeSpend: schema.playerLifetimeStats.totalDepositedUsd,
      purchaseCount: schema.playerLifetimeStats.purchaseCount,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(eq(schema.players.id, playerId))
    .limit(1)
  const player = rows[0]
  if (!player) notFound()

  const hostName = player.assignedHostId
    ? ((
        await db
          .select({ displayName: schema.admins.displayName })
          .from(schema.admins)
          .where(eq(schema.admins.id, player.assignedHostId))
          .limit(1)
      )[0]?.displayName ?? null)
    : null

  const interactions = await vipModule.getInteractionHistory(db, playerId, { limit: 50 })
  const hosts = await fetchHostsList()
  const canReassign = canManageVipAssignments(session.payload.role)

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={player.email}
        subtitle={player.displayName ?? undefined}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'VIP / Hosts', href: '/admin/vip' },
          { label: 'All VIPs', href: '/admin/vip/all-vips' },
          { label: player.email },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={
          <>
            <Link
              href={`/admin/players/${playerId}`}
              className="text-sm text-brand hover:underline"
            >
              Open full player profile →
            </Link>
            {canReassign ? (
              <VipReassignButton
                playerId={playerId}
                currentHostId={player.assignedHostId}
                hosts={hosts.map((h) => ({
                  id: h.id,
                  displayName: h.displayName,
                  vipCount: h.vipCount,
                }))}
              />
            ) : null}
          </>
        }
      />

      <DetailLayout
        primary={
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>VIP profile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="VIP status">
                    <VipBadge status={(player.vipStatus as VipStatus) ?? 'none'} />
                  </Field>
                  <Field label="Qualified">
                    {player.vipQualifiedAt
                      ? new Date(player.vipQualifiedAt).toLocaleDateString()
                      : '—'}
                  </Field>
                  <Field label="Current host">
                    <HostBadge
                      host={
                        player.assignedHostId && hostName
                          ? { id: player.assignedHostId, displayName: hostName }
                          : null
                      }
                      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
                    />
                  </Field>
                  <Field label="Host assigned">
                    {player.hostAssignedAt
                      ? new Date(player.hostAssignedAt).toLocaleDateString()
                      : '—'}
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Host activity ({interactions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {interactions.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">No host interactions logged yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {interactions.map((i) => {
                      const channel = (i.metadata as { channel?: string } | null)?.channel
                      return (
                        <li
                          key={i.id}
                          className="flex items-start gap-3 border-b border-line-subtle/40 pb-2 last:border-b-0"
                        >
                          <span className="rounded-sm bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
                            {i.interactionType}
                            {channel ? ` · ${channel}` : ''}
                          </span>
                          <div className="flex-1">
                            <p className="text-ink-primary">{i.notes ?? '(no notes)'}</p>
                            <p className="text-xs text-ink-tertiary">
                              {i.createdAt.toLocaleString()}
                              {i.outcome ? ` · ${i.outcome}` : ''}
                            </p>
                          </div>
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
                    { label: 'State', value: player.state ?? '—' },
                    { label: 'KYC level', value: `L${player.kycLevel}` },
                    {
                      label: 'Lifetime spend',
                      value: formatUsd(player.lifetimeSpend ?? 0n),
                    },
                    {
                      label: 'Purchase count',
                      value: (player.purchaseCount ?? 0).toString(),
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">{label}</p>
      <div className="mt-1 text-sm text-ink-primary">{children}</div>
    </div>
  )
}
