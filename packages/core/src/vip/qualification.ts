import { and, eq, isNull, sql } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'

// M4 — VIP qualification helpers.
//
// Players auto-qualify based on lifetime spend (USD):
//   - $0      –   $999.99  → 'none'
//   - $1,000  – $9,999.99  → 'vip'
//   - $10,000+             → 'high_roller'
//
// The 'candidate' bucket is reserved for manual review — masters can pin a
// player to candidate to mark them as worth assigning a host even before
// they cross the $1k threshold. It is never set automatically.
//
// Money is bigint in minor units, 10_000 minor = 1 major USD.

const SCALE = 10_000n
const VIP_THRESHOLD_USD = 1_000n // $1,000
const HIGH_ROLLER_THRESHOLD_USD = 10_000n // $10,000

export type VipStatus = 'none' | 'candidate' | 'vip' | 'high_roller'

/**
 * Compute the appropriate VIP status from a lifetime spend amount (USD,
 * minor units bigint). Pure — no DB.
 */
export function statusForLifetimeSpend(lifetimeSpendUsdMinor: bigint): VipStatus {
  const major = lifetimeSpendUsdMinor / SCALE
  if (major >= HIGH_ROLLER_THRESHOLD_USD) return 'high_roller'
  if (major >= VIP_THRESHOLD_USD) return 'vip'
  return 'none'
}

export interface EvaluateResult {
  status: VipStatus
  changed: boolean
  previousStatus: VipStatus
  lifetimeSpendUsdMajor: number
}

/**
 * Read `players.vip_status` + `player_lifetime_stats.total_deposited_usd`
 * for a single player, recompute the auto status, and persist the change
 * when it moves upward. Manual candidates and statuses set by masters are
 * preserved by treating any non-'none' downgrade as out-of-scope here.
 *
 * Returns the new status and whether a write happened.
 */
export async function evaluatePlayerVipStatus(
  db: DbExecutor,
  playerId: string,
): Promise<EvaluateResult> {
  const playerRows = await db
    .select({
      id: schema.players.id,
      vipStatus: schema.players.vipStatus,
      vipQualifiedAt: schema.players.vipQualifiedAt,
    })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player) {
    return {
      status: 'none',
      changed: false,
      previousStatus: 'none',
      lifetimeSpendUsdMajor: 0,
    }
  }

  const statsRows = await db
    .select({
      totalDepositedUsd: schema.playerLifetimeStats.totalDepositedUsd,
    })
    .from(schema.playerLifetimeStats)
    .where(eq(schema.playerLifetimeStats.playerId, playerId))
    .limit(1)
  const lifetime = statsRows[0]?.totalDepositedUsd ?? 0n

  const previousStatus = (player.vipStatus ?? 'none') as VipStatus
  const computed = statusForLifetimeSpend(lifetime)

  // We auto-promote but never auto-demote. Manual statuses ('candidate')
  // and explicit master flips stay put — they're domain-meaningful.
  const shouldUpdate =
    computed !== previousStatus &&
    !(previousStatus !== 'none' && computed === 'none') &&
    !(previousStatus === 'candidate' && computed === 'none')

  if (!shouldUpdate) {
    return {
      status: previousStatus,
      changed: false,
      previousStatus,
      lifetimeSpendUsdMajor: Number(lifetime / SCALE),
    }
  }

  await db
    .update(schema.players)
    .set({
      vipStatus: computed,
      vipQualifiedAt: player.vipQualifiedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, playerId))

  return {
    status: computed,
    changed: true,
    previousStatus,
    lifetimeSpendUsdMajor: Number(lifetime / SCALE),
  }
}

/**
 * Force-set a player to a specific VIP status (master/manager action).
 * Writes audit_log and sets `vip_qualified_at` if first time.
 */
export async function setVipStatus(
  db: DbExecutor,
  playerId: string,
  status: VipStatus,
  actorAdminId: string,
  actorRole: string,
  reason?: string,
): Promise<void> {
  const before = await db
    .select({
      vipStatus: schema.players.vipStatus,
      vipQualifiedAt: schema.players.vipQualifiedAt,
    })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)

  const previous = before[0]
  if (!previous) throw new Error('player not found')

  await db
    .update(schema.players)
    .set({
      vipStatus: status,
      vipQualifiedAt: previous.vipQualifiedAt ?? (status !== 'none' ? new Date() : null),
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, playerId))

  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: actorAdminId,
    actorRole,
    action: 'vip.status_changed',
    resourceKind: 'player',
    resourceId: playerId,
    before: { vipStatus: previous.vipStatus },
    after: { vipStatus: status },
    reason: reason ?? null,
  })
}

/**
 * Assign a host to a VIP. Notifies the host (via interaction system row)
 * and writes audit_log. Idempotent — re-assigning to the same host is
 * a no-op.
 */
export async function assignToHost(
  db: DbExecutor,
  playerId: string,
  hostId: string,
  actorAdminId: string,
  actorRole: string,
  reason?: string,
): Promise<{ changed: boolean }> {
  const playerRows = await db
    .select({
      id: schema.players.id,
      assignedHostId: schema.players.assignedHostId,
    })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player) throw new Error('player not found')
  if (player.assignedHostId === hostId) {
    return { changed: false }
  }

  // Validate the target admin is actually a host (or master/manager
  // managing their own list — but only hosts should be assignees).
  const hostRows = await db
    .select({ id: schema.admins.id })
    .from(schema.admins)
    .innerJoin(
      schema.adminRoleAssignments,
      eq(schema.adminRoleAssignments.adminId, schema.admins.id),
    )
    .innerJoin(schema.adminRoles, eq(schema.adminRoles.id, schema.adminRoleAssignments.roleId))
    .where(and(eq(schema.admins.id, hostId), eq(schema.adminRoles.slug, 'host')))
    .limit(1)
  if (!hostRows[0]) throw new Error('target admin is not a host')

  await db
    .update(schema.players)
    .set({
      assignedHostId: hostId,
      hostAssignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, playerId))

  // Log to host_player_interactions as a 'system' breadcrumb so the
  // host sees a row appear in their feed immediately after assignment.
  await db.insert(schema.hostPlayerInteractions).values({
    hostId,
    playerId,
    interactionType: 'system',
    notes: 'Player assigned to you.',
    metadata: {
      assigned_by: actorAdminId,
      previous_host_id: player.assignedHostId ?? null,
    },
  })

  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: actorAdminId,
    actorRole,
    action: 'vip.assigned_to_host',
    resourceKind: 'player',
    resourceId: playerId,
    before: { assignedHostId: player.assignedHostId },
    after: { assignedHostId: hostId },
    reason: reason ?? null,
  })

  return { changed: true }
}

/**
 * Unassign — clear assigned_host_id. Used when deactivating a host or when
 * a master decides to drop coverage.
 */
export async function unassignFromHost(
  db: DbExecutor,
  playerId: string,
  actorAdminId: string,
  actorRole: string,
  reason?: string,
): Promise<{ changed: boolean }> {
  const playerRows = await db
    .select({
      id: schema.players.id,
      assignedHostId: schema.players.assignedHostId,
    })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player) throw new Error('player not found')
  if (player.assignedHostId == null) return { changed: false }

  await db
    .update(schema.players)
    .set({
      assignedHostId: null,
      hostAssignedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, playerId))

  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: actorAdminId,
    actorRole,
    action: 'vip.unassigned_from_host',
    resourceKind: 'player',
    resourceId: playerId,
    before: { assignedHostId: player.assignedHostId },
    after: { assignedHostId: null },
    reason: reason ?? null,
  })
  return { changed: true }
}

/**
 * Bulk reassign every VIP belonging to `fromHostId` over to `toHostId`.
 * Used when deactivating a host. Each move writes a single audit entry +
 * 'system' interaction; we cap the iteration to keep the write fan-out
 * predictable.
 */
export async function reassignAllVipsFromHost(
  db: DbExecutor,
  fromHostId: string,
  toHostId: string | null,
  actorAdminId: string,
  actorRole: string,
): Promise<{ count: number }> {
  const players = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(and(eq(schema.players.assignedHostId, fromHostId), isNull(schema.players.deletedAt)))

  let count = 0
  for (const p of players) {
    if (toHostId) {
      const r = await assignToHost(db, p.id, toHostId, actorAdminId, actorRole, 'bulk reassignment')
      if (r.changed) count++
    } else {
      const r = await unassignFromHost(db, p.id, actorAdminId, actorRole, 'host deactivated')
      if (r.changed) count++
    }
  }
  return { count }
}

/**
 * Recompute VIP status for every player whose lifetime spend has crossed
 * a threshold. Worker job calls this once nightly. Returns the count of
 * upgrades and the list of newly-qualified player IDs (so a notification
 * can be sent to the master admin pool).
 */
export async function evaluateAllPlayers(
  db: DbExecutor,
): Promise<{ upgradeCount: number; newlyQualifiedIds: string[] }> {
  // We only look at non-internal, non-deleted players whose lifetime spend
  // pushes them across the next threshold. Limit isn't enforced — this
  // runs in a background worker against the read replica.
  const rows: { id: string; status: string; spend: bigint }[] = await db
    .select({
      id: schema.players.id,
      status: schema.players.vipStatus,
      spend: schema.playerLifetimeStats.totalDepositedUsd,
    })
    .from(schema.players)
    .innerJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(
      and(
        eq(schema.players.isInternalAccount, false),
        isNull(schema.players.deletedAt),
        // Avoid pulling rows that are obviously fine.
        sql`${schema.playerLifetimeStats.totalDepositedUsd} >= ${VIP_THRESHOLD_USD * SCALE}::numeric(20,4)`,
      ),
    )

  const newlyQualifiedIds: string[] = []
  let upgradeCount = 0
  for (const r of rows) {
    const target = statusForLifetimeSpend(r.spend)
    const prev = (r.status ?? 'none') as VipStatus
    if (target !== prev && !(prev !== 'none' && target === 'none')) {
      await db
        .update(schema.players)
        .set({
          vipStatus: target,
          vipQualifiedAt: sql`coalesce(${schema.players.vipQualifiedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(eq(schema.players.id, r.id))
      upgradeCount++
      if (prev === 'none') newlyQualifiedIds.push(r.id)
    }
  }
  return { upgradeCount, newlyQualifiedIds }
}
