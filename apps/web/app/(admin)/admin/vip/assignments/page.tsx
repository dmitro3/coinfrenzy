import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import { canManageVipAssignments } from '@coinfrenzy/core/auth'
import { PageHeader } from '@coinfrenzy/ui/admin'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'

import { fetchHostsList } from '../_data'
import { AssignmentsClient, type AssignablePlayerJson } from './_client'

export const dynamic = 'force-dynamic'

export default async function AssignmentsPage() {
  const session = await requireAdminSession('/admin/vip/assignments')
  if (!canManageVipAssignments(session.payload.role)) {
    redirect('/admin')
  }

  const db = getDb()

  // Unassigned VIPs needing coverage.
  const unassigned = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      vipStatus: schema.players.vipStatus,
      vipQualifiedAt: schema.players.vipQualifiedAt,
      spend: schema.playerLifetimeStats.totalDepositedUsd,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(
      and(
        inArray(schema.players.vipStatus, ['candidate', 'vip', 'high_roller']),
        isNull(schema.players.assignedHostId),
        isNull(schema.players.deletedAt),
      ),
    )
    .orderBy(desc(schema.players.vipQualifiedAt))
    .limit(500)

  const hosts = await fetchHostsList()

  const players: AssignablePlayerJson[] = unassigned.map((p) => ({
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    vipStatus: p.vipStatus,
    vipQualifiedAt: p.vipQualifiedAt ? p.vipQualifiedAt.toISOString() : null,
    lifetimeSpendUsdMinor: (p.spend ?? 0n).toString(),
  }))

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title="Assignments"
        subtitle={`${players.length} unassigned VIPs`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'VIP / Hosts', href: '/admin/vip' },
          { label: 'Assignments' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <AssignmentsClient
        players={players}
        hosts={hosts.map((h) => ({
          id: h.id,
          displayName: h.displayName,
          vipCount: h.vipCount,
        }))}
      />
    </div>
  )
}
