import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { AlertTriangle } from 'lucide-react'

import { canViewAllVips } from '@coinfrenzy/core/auth'
import { vip as vipModule } from '@coinfrenzy/core'
import { DetailLayout, KeyValueGrid, PageHeader, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { relativeTime } from '@/lib/format'

import { HostPlayerRoster, type RosterPlayer } from './_host-player-roster'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const NEEDS_ATTENTION_DAYS = 14

export default async function HostDetailPage({ params }: PageProps) {
  const session = await requireAdminSession()
  if (!canViewAllVips(session.payload.role)) {
    redirect('/admin')
  }

  const { id } = await params
  const db = getDb()

  const hostRows = await db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      displayName: schema.admins.displayName,
      status: schema.admins.status,
      createdAt: schema.admins.createdAt,
      lastLoginAt: schema.admins.lastLoginAt,
    })
    .from(schema.admins)
    .innerJoin(
      schema.adminRoleAssignments,
      eq(schema.adminRoleAssignments.adminId, schema.admins.id),
    )
    .innerJoin(
      schema.adminRoles,
      and(
        eq(schema.adminRoles.id, schema.adminRoleAssignments.roleId),
        eq(schema.adminRoles.slug, 'host'),
      ),
    )
    .where(eq(schema.admins.id, id))
    .limit(1)
  const host = hostRows[0]
  if (!host) notFound()

  // Pull this host's VIPs joined with their last interaction time and
  // lifetime spend. We compute the per-row "last interaction" in the same
  // query so the client can flag needs-attention without a second roundtrip.
  const vipRows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      vipStatus: schema.players.vipStatus,
      hostAssignedAt: schema.players.hostAssignedAt,
      lastSeenAt: schema.players.lastSeenAt,
      lifetimeSpend: schema.playerLifetimeStats.totalDepositedUsd,
      lastInteractionAt: sql<Date | null>`MAX(${schema.hostPlayerInteractions.createdAt})`,
    })
    .from(schema.players)
    .leftJoin(
      schema.hostPlayerInteractions,
      and(
        eq(schema.hostPlayerInteractions.playerId, schema.players.id),
        eq(schema.hostPlayerInteractions.hostId, id),
      ),
    )
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(and(eq(schema.players.assignedHostId, id), isNull(schema.players.deletedAt)))
    .groupBy(
      schema.players.id,
      schema.players.email,
      schema.players.displayName,
      schema.players.vipStatus,
      schema.players.hostAssignedAt,
      schema.players.lastSeenAt,
      schema.playerLifetimeStats.totalDepositedUsd,
    )
    .orderBy(desc(schema.players.hostAssignedAt))

  const now = Date.now()
  const cutoffMs = NEEDS_ATTENTION_DAYS * 24 * 3600 * 1000
  const vips: RosterPlayer[] = vipRows.map((v) => {
    const last = v.lastInteractionAt ? new Date(v.lastInteractionAt) : null
    const days = last == null ? 9999 : Math.floor((now - last.getTime()) / (24 * 3600 * 1000))
    return {
      id: v.id,
      email: v.email,
      displayName: v.displayName,
      vipStatus: v.vipStatus,
      hostAssignedAt: v.hostAssignedAt ? v.hostAssignedAt.toISOString() : null,
      lastSeenAt: v.lastSeenAt ? v.lastSeenAt.toISOString() : null,
      lastInteractionAt: last ? last.toISOString() : null,
      daysSinceLastInteraction: days,
      needsAttention: last == null || now - last.getTime() > cutoffMs,
      lifetimeSpendUsdMinor: (v.lifetimeSpend ?? 0n).toString(),
    }
  })

  const interactions = await vipModule.getHostInteractions(db, id, { limit: 50 })

  // Channel-breakdown for the right sidebar so the operator can sanity-check
  // that the host is actually working (e.g. all interactions WhatsApp ✔, or
  // suspiciously all "note" with no real outreach).
  const channelCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}
  for (const i of interactions) {
    typeCounts[i.interactionType] = (typeCounts[i.interactionType] ?? 0) + 1
    const ch = (i.metadata as { channel?: string } | null)?.channel
    if (ch) channelCounts[ch] = (channelCounts[ch] ?? 0) + 1
  }

  const needsAttentionCount = vips.filter((v) => v.needsAttention).length

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={host.displayName}
        subtitle={host.email}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'VIP / Hosts', href: '/admin/vip' },
          { label: 'Hosts', href: '/admin/vip/hosts' },
          { label: host.displayName },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={
          <StatusPill
            status="custom"
            label={host.status === 'active' ? 'Active' : 'Inactive'}
            color={host.status === 'active' ? 'positive' : 'neutral'}
          />
        }
      />

      <DetailLayout
        primary={
          <div className="space-y-6">
            {needsAttentionCount > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-attention">
                    <AlertTriangle className="h-4 w-4" />
                    Needs a touch ({needsAttentionCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-ink-secondary">
                    These players haven&apos;t been contacted in {NEEDS_ATTENTION_DAYS}+ days. Use
                    the quick-log buttons below to record outreach as you go.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Their VIPs ({vips.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <HostPlayerRoster players={vips} hostName={host.displayName} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent interactions</CardTitle>
              </CardHeader>
              <CardContent>
                {interactions.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">No interactions logged yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {interactions.slice(0, 25).map((i) => {
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
                              {relativeTime(i.createdAt)}
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
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Name', value: host.displayName },
                    { label: 'Email', value: host.email },
                    {
                      label: 'Joined',
                      value: new Date(host.createdAt).toLocaleDateString(),
                    },
                    {
                      label: 'Last login',
                      value: host.lastLoginAt
                        ? new Date(host.lastLoginAt).toLocaleString()
                        : 'Never',
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity mix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-tertiary">VIPs assigned</span>
                  <span className="font-medium text-ink-primary">{vips.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-tertiary">Needs attention</span>
                  <span
                    className={`font-medium ${
                      needsAttentionCount > 0 ? 'text-attention' : 'text-ink-primary'
                    }`}
                  >
                    {needsAttentionCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-tertiary">Interactions logged</span>
                  <span className="font-medium text-ink-primary">{interactions.length}</span>
                </div>

                {Object.keys(typeCounts).length > 0 && (
                  <div className="border-t border-line-subtle pt-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
                      By type
                    </p>
                    {Object.entries(typeCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="capitalize text-ink-secondary">
                            {k.replace('_', ' ')}
                          </span>
                          <span className="tabular-nums text-ink-primary">{v}</span>
                        </div>
                      ))}
                  </div>
                )}

                {Object.keys(channelCounts).length > 0 && (
                  <div className="border-t border-line-subtle pt-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
                      By channel
                    </p>
                    {Object.entries(channelCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="capitalize text-ink-secondary">
                            {k.replace('_', ' ')}
                          </span>
                          <span className="tabular-nums text-ink-primary">{v}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        }
      />
    </div>
  )
}
