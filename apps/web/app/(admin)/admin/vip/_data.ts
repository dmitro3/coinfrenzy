import 'server-only'

import { and, desc, eq, gte, ilike, inArray, isNull, isNotNull, lt, or, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// M4 — Shared server-side data layer for /admin/vip/* pages.

const VIP_STATUSES = ['candidate', 'vip', 'high_roller'] as const
type VipStatusFilter = (typeof VIP_STATUSES)[number] | 'all'

export interface AdminVipOverview {
  totalVips: number
  unassignedVips: number
  newThisWeek: number
  topSpendingUsdMinor: bigint
  totalVipLtvUsdMinor: bigint
}

export async function fetchVipOverview(): Promise<AdminVipOverview> {
  const db = getDb()
  // postgres-js cannot bind raw JS Date inside `sql` template literals
  // (throws ERR_INVALID_ARG_TYPE in Buffer.byteLength). Convert to ISO
  // string and let postgres cast via `::timestamptz`.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [agg] = await db
    .select({
      totalVips: sql<number>`COUNT(*)::int`,
      unassignedVips: sql<number>`COUNT(*) FILTER (WHERE ${schema.players.assignedHostId} IS NULL)::int`,
      newThisWeek: sql<number>`COUNT(*) FILTER (WHERE ${schema.players.vipQualifiedAt} >= ${sevenDaysAgo}::timestamptz)::int`,
    })
    .from(schema.players)
    .where(
      and(
        inArray(schema.players.vipStatus, [...VIP_STATUSES]),
        isNull(schema.players.deletedAt),
        eq(schema.players.isInternalAccount, false),
      ),
    )

  const [spendAgg] = await db
    .select({
      maxSpend: sql<string>`COALESCE(MAX(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::text`,
      totalSpend: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::text`,
    })
    .from(schema.players)
    .innerJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(
      and(inArray(schema.players.vipStatus, [...VIP_STATUSES]), isNull(schema.players.deletedAt)),
    )

  return {
    totalVips: agg?.totalVips ?? 0,
    unassignedVips: agg?.unassignedVips ?? 0,
    newThisWeek: agg?.newThisWeek ?? 0,
    topSpendingUsdMinor: parseDecimalToMinor(spendAgg?.maxSpend ?? '0'),
    totalVipLtvUsdMinor: parseDecimalToMinor(spendAgg?.totalSpend ?? '0'),
  }
}

export interface VipsByHostRow {
  hostId: string
  hostName: string
  hostEmail: string
  vipCount: number
  totalLtvUsdMinor: bigint
  lastInteractionAt: Date | null
}

export async function fetchVipsByHost(): Promise<VipsByHostRow[]> {
  const db = getDb()
  // Pull active hosts via role assignment.
  const rows: {
    id: string
    name: string
    email: string
    vipCount: number
    totalLtv: string
    lastInteractionAt: Date | null
  }[] = await db
    .select({
      id: schema.admins.id,
      name: schema.admins.displayName,
      email: schema.admins.email,
      vipCount: sql<number>`COUNT(DISTINCT ${schema.players.id})::int`,
      totalLtv: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::text`,
      lastInteractionAt: sql<Date | null>`MAX(${schema.hostPlayerInteractions.createdAt})`,
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
    .leftJoin(
      schema.players,
      and(eq(schema.players.assignedHostId, schema.admins.id), isNull(schema.players.deletedAt)),
    )
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .leftJoin(
      schema.hostPlayerInteractions,
      eq(schema.hostPlayerInteractions.hostId, schema.admins.id),
    )
    .where(eq(schema.admins.status, 'active'))
    .groupBy(schema.admins.id, schema.admins.displayName, schema.admins.email)
    .orderBy(desc(sql<number>`COUNT(DISTINCT ${schema.players.id})`))

  return rows.map((r) => ({
    hostId: r.id,
    hostName: r.name,
    hostEmail: r.email,
    vipCount: r.vipCount,
    totalLtvUsdMinor: parseDecimalToMinor(r.totalLtv),
    lastInteractionAt: r.lastInteractionAt ? new Date(r.lastInteractionAt) : null,
  }))
}

export interface RecentQualificationRow {
  playerId: string
  email: string
  displayName: string | null
  vipStatus: string
  vipQualifiedAt: Date
  lifetimeSpendUsdMinor: bigint
  assignedHostId: string | null
}

export async function fetchRecentQualifications(
  withinDays = 7,
  limit = 25,
): Promise<RecentQualificationRow[]> {
  const db = getDb()
  const cutoff = new Date(Date.now() - withinDays * 24 * 3600 * 1000)

  const rows: {
    id: string
    email: string
    displayName: string | null
    vipStatus: string
    vipQualifiedAt: Date | null
    spend: string
    assignedHostId: string | null
  }[] = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      vipStatus: schema.players.vipStatus,
      vipQualifiedAt: schema.players.vipQualifiedAt,
      spend: sql<string>`COALESCE(${schema.playerLifetimeStats.totalDepositedUsd}, 0)::text`,
      assignedHostId: schema.players.assignedHostId,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(
      and(
        inArray(schema.players.vipStatus, [...VIP_STATUSES]),
        isNotNull(schema.players.vipQualifiedAt),
        gte(schema.players.vipQualifiedAt, cutoff),
        isNull(schema.players.deletedAt),
      ),
    )
    .orderBy(desc(schema.players.vipQualifiedAt))
    .limit(limit)

  return rows
    .filter((r): r is typeof r & { vipQualifiedAt: Date } => r.vipQualifiedAt != null)
    .map((r) => ({
      playerId: r.id,
      email: r.email,
      displayName: r.displayName,
      vipStatus: r.vipStatus,
      vipQualifiedAt: new Date(r.vipQualifiedAt),
      lifetimeSpendUsdMinor: parseDecimalToMinor(r.spend),
      assignedHostId: r.assignedHostId,
    }))
}

export interface AdminVipListFilters {
  search?: string
  status?: VipStatusFilter
  hostId?: string | 'unassigned' | 'all'
  activity?: 'active7d' | 'dormant30d' | 'all'
  kycLevel?: 'all' | '0' | '1' | '2' | '3'
}

export interface AdminVipListRow {
  id: string
  email: string
  displayName: string | null
  vipStatus: string
  lifetimeSpendUsdMinor: bigint
  assignedHostId: string | null
  assignedHostName: string | null
  lastSeenAt: Date | null
  lastInteractionAt: Date | null
  kycLevel: number
}

export async function fetchAllVips(filters: AdminVipListFilters): Promise<{
  rows: AdminVipListRow[]
  totalCount: number
}> {
  const db = getDb()
  const conditions = [
    inArray(schema.players.vipStatus, [...VIP_STATUSES]),
    isNull(schema.players.deletedAt),
    eq(schema.players.isInternalAccount, false),
  ]

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(schema.players.email, q),
        ilike(schema.players.username, q),
        ilike(schema.players.displayName, q),
      )!,
    )
  }
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(schema.players.vipStatus, filters.status))
  }
  if (filters.hostId === 'unassigned') {
    conditions.push(isNull(schema.players.assignedHostId))
  } else if (filters.hostId && filters.hostId !== 'all') {
    conditions.push(eq(schema.players.assignedHostId, filters.hostId))
  }
  if (filters.kycLevel && filters.kycLevel !== 'all') {
    conditions.push(eq(schema.players.kycLevel, Number(filters.kycLevel)))
  }
  if (filters.activity === 'active7d') {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    conditions.push(gte(schema.players.lastSeenAt, cutoff))
  } else if (filters.activity === 'dormant30d') {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    conditions.push(or(lt(schema.players.lastSeenAt, cutoff), isNull(schema.players.lastSeenAt))!)
  }

  const where = and(...conditions)

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.players)
    .where(where)

  // Use the admins table to fetch host name in a single join.
  const rows: {
    id: string
    email: string
    displayName: string | null
    vipStatus: string
    spend: string
    assignedHostId: string | null
    assignedHostName: string | null
    lastSeenAt: Date | null
    kycLevel: number
  }[] = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      vipStatus: schema.players.vipStatus,
      spend: sql<string>`COALESCE(${schema.playerLifetimeStats.totalDepositedUsd}, 0)::text`,
      assignedHostId: schema.players.assignedHostId,
      assignedHostName: schema.admins.displayName,
      lastSeenAt: schema.players.lastSeenAt,
      kycLevel: schema.players.kycLevel,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .leftJoin(schema.admins, eq(schema.admins.id, schema.players.assignedHostId))
    .where(where)
    .orderBy(desc(sql<string>`COALESCE(${schema.playerLifetimeStats.totalDepositedUsd}, 0)`))
    .limit(500)

  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      vipStatus: r.vipStatus,
      lifetimeSpendUsdMinor: parseDecimalToMinor(r.spend),
      assignedHostId: r.assignedHostId,
      assignedHostName: r.assignedHostName,
      lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt) : null,
      lastInteractionAt: null,
      kycLevel: r.kycLevel,
    })),
    totalCount: countRow?.count ?? 0,
  }
}

export interface HostListRow {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: Date
  lastLoginAt: Date | null
  vipCount: number
  totalLtvUsdMinor: bigint
  interactionsLast30d: number
}

export async function fetchHostsList(): Promise<HostListRow[]> {
  const db = getDb()
  // ISO string — see note in fetchVipOverview about Date binding.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const rows: {
    id: string
    email: string
    displayName: string
    status: string
    createdAt: Date
    lastLoginAt: Date | null
    vipCount: number
    totalLtv: string
    interactionsLast30d: number
  }[] = await db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      displayName: schema.admins.displayName,
      status: schema.admins.status,
      createdAt: schema.admins.createdAt,
      lastLoginAt: schema.admins.lastLoginAt,
      vipCount: sql<number>`COUNT(DISTINCT ${schema.players.id})::int`,
      totalLtv: sql<string>`COALESCE(SUM(${schema.playerLifetimeStats.totalDepositedUsd}), 0)::text`,
      interactionsLast30d: sql<number>`COUNT(${schema.hostPlayerInteractions.id}) FILTER (WHERE ${schema.hostPlayerInteractions.createdAt} >= ${thirtyDaysAgo}::timestamptz)::int`,
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
    .leftJoin(
      schema.players,
      and(eq(schema.players.assignedHostId, schema.admins.id), isNull(schema.players.deletedAt)),
    )
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .leftJoin(
      schema.hostPlayerInteractions,
      eq(schema.hostPlayerInteractions.hostId, schema.admins.id),
    )
    .groupBy(
      schema.admins.id,
      schema.admins.email,
      schema.admins.displayName,
      schema.admins.status,
      schema.admins.createdAt,
      schema.admins.lastLoginAt,
    )
    .orderBy(desc(schema.admins.createdAt))

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    status: r.status,
    createdAt: new Date(r.createdAt),
    lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt) : null,
    vipCount: r.vipCount,
    totalLtvUsdMinor: parseDecimalToMinor(r.totalLtv),
    interactionsLast30d: r.interactionsLast30d,
  }))
}

function parseDecimalToMinor(value: string): bigint {
  if (!value) return 0n
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [majorStr = '0', fracStr = ''] = abs.split('.')
  const fracPadded = fracStr.padEnd(4, '0').slice(0, 4)
  const total = BigInt(majorStr) * 10000n + BigInt(fracPadded || '0')
  return negative ? -total : total
}
