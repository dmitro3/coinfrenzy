import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'

// M4 — Host interactions log.
//
// Hosts call/text/email/visit their VIPs. Every such touchpoint is logged
// here. The same table also records the breadcrumbs from `bonus_sent`,
// `message_sent`, and free-form `note` rows.
//
// RLS limits hosts to their own rows; managers/masters see everything (see
// the policies in migration 0010).

export type InteractionType =
  | 'call'
  | 'text'
  | 'email'
  | 'in_person'
  | 'bonus_sent'
  | 'note'
  | 'message_sent'
  | 'system'

export type InteractionOutcome = 'positive' | 'neutral' | 'negative' | 'no_response'

export interface LogInteractionInput {
  hostId: string
  playerId: string
  type: InteractionType
  notes?: string | null
  outcome?: InteractionOutcome | null
  metadata?: Record<string, unknown>
  actorRole?: string
  /** Skip writing to audit_log — used for the bulk-system breadcrumbs. */
  skipAudit?: boolean
}

export interface InteractionRow {
  id: string
  hostId: string
  playerId: string
  interactionType: InteractionType
  notes: string | null
  outcome: InteractionOutcome | null
  metadata: Record<string, unknown>
  createdAt: Date
}

/**
 * Write one interaction row. Validates the player is assigned to this host
 * for non-master callers (callers pass `actorRole` so we can apply the
 * stricter rule). Audit-logs unless `skipAudit` is true.
 */
export async function logInteraction(
  db: DbExecutor,
  input: LogInteractionInput,
): Promise<InteractionRow> {
  // Master / manager can log against any player; hosts must own them.
  if (input.actorRole === 'host') {
    const ownership = await db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(
        and(eq(schema.players.id, input.playerId), eq(schema.players.assignedHostId, input.hostId)),
      )
      .limit(1)
    if (!ownership[0]) {
      throw new Error('host does not own this player')
    }
  }

  const inserted = await db
    .insert(schema.hostPlayerInteractions)
    .values({
      hostId: input.hostId,
      playerId: input.playerId,
      interactionType: input.type,
      notes: input.notes ?? null,
      outcome: input.outcome ?? null,
      metadata: input.metadata ?? {},
    })
    .returning({
      id: schema.hostPlayerInteractions.id,
      hostId: schema.hostPlayerInteractions.hostId,
      playerId: schema.hostPlayerInteractions.playerId,
      interactionType: schema.hostPlayerInteractions.interactionType,
      notes: schema.hostPlayerInteractions.notes,
      outcome: schema.hostPlayerInteractions.outcome,
      metadata: schema.hostPlayerInteractions.metadata,
      createdAt: schema.hostPlayerInteractions.createdAt,
    })

  if (!input.skipAudit) {
    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: input.hostId,
      actorRole: input.actorRole ?? 'host',
      action: 'host.interaction_logged',
      resourceKind: 'player',
      resourceId: input.playerId,
      metadata: {
        interaction_type: input.type,
        outcome: input.outcome ?? null,
      },
    })
  }

  const row = inserted[0]!
  return {
    id: row.id,
    hostId: row.hostId,
    playerId: row.playerId,
    interactionType: row.interactionType as InteractionType,
    notes: row.notes,
    outcome: (row.outcome ?? null) as InteractionOutcome | null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  }
}

export interface InteractionHistoryOptions {
  limit?: number
  types?: InteractionType[]
  /** When set, only return rows authored by these hosts. */
  hostIds?: string[]
}

/**
 * Read interaction history for one player. Caller is responsible for
 * applying the RLS WHERE (we pass the param straight through and the DB
 * policy filters).
 */
export async function getInteractionHistory(
  db: DbExecutor,
  playerId: string,
  options: InteractionHistoryOptions = {},
): Promise<InteractionRow[]> {
  const whereConds = [eq(schema.hostPlayerInteractions.playerId, playerId)]
  if (options.types && options.types.length > 0) {
    whereConds.push(inArray(schema.hostPlayerInteractions.interactionType, options.types))
  }
  if (options.hostIds && options.hostIds.length > 0) {
    whereConds.push(inArray(schema.hostPlayerInteractions.hostId, options.hostIds))
  }

  const rows = await db
    .select({
      id: schema.hostPlayerInteractions.id,
      hostId: schema.hostPlayerInteractions.hostId,
      playerId: schema.hostPlayerInteractions.playerId,
      interactionType: schema.hostPlayerInteractions.interactionType,
      notes: schema.hostPlayerInteractions.notes,
      outcome: schema.hostPlayerInteractions.outcome,
      metadata: schema.hostPlayerInteractions.metadata,
      createdAt: schema.hostPlayerInteractions.createdAt,
    })
    .from(schema.hostPlayerInteractions)
    .where(and(...whereConds))
    .orderBy(desc(schema.hostPlayerInteractions.createdAt))
    .limit(options.limit ?? 100)

  return rows.map((r) => ({
    id: r.id,
    hostId: r.hostId,
    playerId: r.playerId,
    interactionType: r.interactionType as InteractionType,
    notes: r.notes,
    outcome: (r.outcome ?? null) as InteractionOutcome | null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }))
}

/**
 * Read every interaction a host has made — across all their VIPs.
 */
export async function getHostInteractions(
  db: DbExecutor,
  hostId: string,
  options: { limit?: number } = {},
): Promise<InteractionRow[]> {
  const rows = await db
    .select({
      id: schema.hostPlayerInteractions.id,
      hostId: schema.hostPlayerInteractions.hostId,
      playerId: schema.hostPlayerInteractions.playerId,
      interactionType: schema.hostPlayerInteractions.interactionType,
      notes: schema.hostPlayerInteractions.notes,
      outcome: schema.hostPlayerInteractions.outcome,
      metadata: schema.hostPlayerInteractions.metadata,
      createdAt: schema.hostPlayerInteractions.createdAt,
    })
    .from(schema.hostPlayerInteractions)
    .where(eq(schema.hostPlayerInteractions.hostId, hostId))
    .orderBy(desc(schema.hostPlayerInteractions.createdAt))
    .limit(options.limit ?? 200)

  return rows.map((r) => ({
    id: r.id,
    hostId: r.hostId,
    playerId: r.playerId,
    interactionType: r.interactionType as InteractionType,
    notes: r.notes,
    outcome: (r.outcome ?? null) as InteractionOutcome | null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }))
}

export interface VipNeedingAttention {
  playerId: string
  email: string
  displayName: string | null
  lastInteractionAt: Date | null
  daysSinceLastInteraction: number
  lifetimeSpendUsdMinor: bigint
}

/**
 * For a given host, return their VIPs ordered by 'most overdue first'. A
 * VIP "needs attention" when there's been no interaction in 7+ days (or
 * none ever). Used by the host dashboard.
 */
export async function getInteractionsNeedingAttention(
  db: DbExecutor,
  hostId: string,
  options: { thresholdDays?: number; limit?: number } = {},
): Promise<VipNeedingAttention[]> {
  const threshold = options.thresholdDays ?? 7
  const cutoff = new Date(Date.now() - threshold * 24 * 3600 * 1000)

  const rows: {
    id: string
    email: string
    displayName: string | null
    lastInteractionAt: Date | null
    spend: bigint | null
  }[] = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      lastInteractionAt: sql<Date | null>`MAX(${schema.hostPlayerInteractions.createdAt})`,
      spend: schema.playerLifetimeStats.totalDepositedUsd,
    })
    .from(schema.players)
    .leftJoin(
      schema.hostPlayerInteractions,
      and(
        eq(schema.hostPlayerInteractions.playerId, schema.players.id),
        eq(schema.hostPlayerInteractions.hostId, hostId),
      ),
    )
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .where(eq(schema.players.assignedHostId, hostId))
    .groupBy(
      schema.players.id,
      schema.players.email,
      schema.players.displayName,
      schema.playerLifetimeStats.totalDepositedUsd,
    )
    .limit(options.limit ?? 100)

  const now = Date.now()
  const out: VipNeedingAttention[] = rows
    .filter((r) => r.lastInteractionAt == null || r.lastInteractionAt < cutoff)
    .map((r) => {
      const last = r.lastInteractionAt ? new Date(r.lastInteractionAt) : null
      const days = last == null ? 365 : Math.floor((now - last.getTime()) / (24 * 3600 * 1000))
      return {
        playerId: r.id,
        email: r.email,
        displayName: r.displayName,
        lastInteractionAt: last,
        daysSinceLastInteraction: days,
        lifetimeSpendUsdMinor: r.spend ?? 0n,
      }
    })
    .sort((a, b) => b.daysSinceLastInteraction - a.daysSinceLastInteraction)
  return out
}
