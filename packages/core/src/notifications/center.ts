// docs/11 §6 — Notification Center (admin in-app push surface).
//
// Mirrors `emailCenter` but writes to the in-app `notifications` table
// instead of an email channel. The compose surface targets either a
// single player (lookup by id or email) or every active player (a
// broadcast). Each send is audited and assigned a deterministic
// `sourceKind = 'admin_one_off'` so we can trace the row.

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

export type NotificationCenterError =
  | { code: 'INVALID'; reason: string }
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'NO_RECIPIENTS' }

export type NotificationPriority = 'low' | 'normal' | 'high'

export interface SendOneOffInput {
  /** Single-player send. Mutually exclusive with `audience`. */
  toPlayerId?: string

  /**
   * Broadcast recipient set. We resolve to player ids at send-time
   * inside core so the audit log captures the count actually written.
   *
   *   - 'all_active': every player with status='active'
   *   - 'never': admin sanity escape — useful in dev to test compose
   *     without spamming users.
   */
  audience?: 'all_active' | 'never'

  title: string
  body?: string | null
  ctaUrl?: string | null
  category?: string | null
  priority?: NotificationPriority
  expiresAt?: Date | null
}

export interface SendOneOffResult {
  recipientCount: number
  /** First id written — useful for the success toast row link. */
  firstId: string | null
}

const TITLE_MAX = 120
const BODY_MAX = 600
const URL_MAX = 500

export async function sendOneOffNotification(
  ctx: Context,
  input: SendOneOffInput,
): Promise<Result<SendOneOffResult, NotificationCenterError>> {
  if (ctx.actor.kind !== 'admin') {
    return err({ code: 'INVALID' as const, reason: 'admin_only' })
  }

  if (!input.title || input.title.trim().length === 0) {
    return err({ code: 'INVALID' as const, reason: 'title_required' })
  }
  if (input.title.length > TITLE_MAX) {
    return err({ code: 'INVALID' as const, reason: 'title_too_long' })
  }
  if (input.body && input.body.length > BODY_MAX) {
    return err({ code: 'INVALID' as const, reason: 'body_too_long' })
  }
  if (input.ctaUrl && input.ctaUrl.length > URL_MAX) {
    return err({ code: 'INVALID' as const, reason: 'cta_url_too_long' })
  }
  if (input.ctaUrl && !/^https?:\/\//.test(input.ctaUrl) && !input.ctaUrl.startsWith('/')) {
    return err({ code: 'INVALID' as const, reason: 'cta_url_invalid' })
  }
  if (input.toPlayerId && input.audience) {
    return err({ code: 'INVALID' as const, reason: 'specify_one_of_player_or_audience' })
  }
  if (!input.toPlayerId && !input.audience) {
    return err({ code: 'INVALID' as const, reason: 'recipient_required' })
  }

  // Resolve recipient ids.
  let recipientIds: string[] = []
  if (input.toPlayerId) {
    const p = await ctx.db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(eq(schema.players.id, input.toPlayerId))
      .limit(1)
    if (!p[0]) return err({ code: 'PLAYER_NOT_FOUND' as const })
    recipientIds = [p[0].id]
  } else if (input.audience === 'all_active') {
    const rows = await ctx.db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(eq(schema.players.status, 'active'))
    recipientIds = rows.map((r) => r.id)
  } else {
    // audience === 'never'
    recipientIds = []
  }

  if (recipientIds.length === 0 && input.audience !== 'never') {
    return err({ code: 'NO_RECIPIENTS' as const })
  }

  const now = new Date()
  const priority = input.priority ?? 'normal'

  // Bulk insert in chunks of 500 to keep individual statements bounded.
  let firstId: string | null = null
  for (let i = 0; i < recipientIds.length; i += 500) {
    const chunk = recipientIds.slice(i, i + 500)
    const inserted = await ctx.db
      .insert(schema.notifications)
      .values(
        chunk.map((playerId) => ({
          playerId,
          title: input.title,
          body: input.body ?? null,
          ctaUrl: input.ctaUrl ?? null,
          category: input.category ?? null,
          priority,
          sourceKind: 'admin_one_off',
          sourceId: `admin:${ctx.actor.kind === 'admin' ? ctx.actor.adminId : 'system'}:${now.toISOString()}`,
          expiresAt: input.expiresAt ?? null,
        })),
      )
      .returning({ id: schema.notifications.id })
    if (!firstId && inserted[0]) firstId = inserted[0].id
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'notification.one_off_send',
    resourceKind: 'notification',
    resourceId: firstId,
    after: {
      audience: input.audience ?? null,
      toPlayerId: input.toPlayerId ?? null,
      recipientCount: recipientIds.length,
      title: input.title,
      priority,
    },
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok({ recipientCount: recipientIds.length, firstId })
}

// -------------------------------------------------------------------------
// List + detail reads
// -------------------------------------------------------------------------

export interface InboxFilters {
  search?: string
  priority?: NotificationPriority | 'all'
  unreadOnly?: boolean
  limit?: number
}

export interface InboxRow {
  id: string
  playerId: string
  title: string
  body: string | null
  category: string | null
  priority: string
  readAt: Date | null
  createdAt: Date
  expiresAt: Date | null
}

export async function listInbox(ctx: Context, filters: InboxFilters = {}): Promise<InboxRow[]> {
  const conds = []
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`
    conds.push(
      sql`(${schema.notifications.title} ILIKE ${q} OR ${schema.notifications.body} ILIKE ${q})`,
    )
  }
  if (filters.priority && filters.priority !== 'all') {
    conds.push(eq(schema.notifications.priority, filters.priority))
  }
  if (filters.unreadOnly) {
    conds.push(isNull(schema.notifications.readAt))
  }
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500))

  const rows = await ctx.db
    .select({
      id: schema.notifications.id,
      playerId: schema.notifications.playerId,
      title: schema.notifications.title,
      body: schema.notifications.body,
      category: schema.notifications.category,
      priority: schema.notifications.priority,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      expiresAt: schema.notifications.expiresAt,
    })
    .from(schema.notifications)
    .where(conds.length > 0 ? and(...conds) : sql`true`)
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)

  return rows
}

export interface InboxDetail extends InboxRow {
  ctaUrl: string | null
  sourceKind: string | null
  sourceId: string | null
  playerEmail: string | null
  playerUsername: string | null
}

export async function getNotification(ctx: Context, id: string): Promise<InboxDetail | null> {
  const rows = await ctx.db
    .select({
      id: schema.notifications.id,
      playerId: schema.notifications.playerId,
      title: schema.notifications.title,
      body: schema.notifications.body,
      ctaUrl: schema.notifications.ctaUrl,
      category: schema.notifications.category,
      priority: schema.notifications.priority,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      expiresAt: schema.notifications.expiresAt,
      sourceKind: schema.notifications.sourceKind,
      sourceId: schema.notifications.sourceId,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.id, id))
    .limit(1)
  const r = rows[0]
  if (!r) return null

  let playerEmail: string | null = null
  let playerUsername: string | null = null
  if (r.playerId) {
    const p = await ctx.db
      .select({ email: schema.players.email, username: schema.players.username })
      .from(schema.players)
      .where(eq(schema.players.id, r.playerId))
      .limit(1)
    if (p[0]) {
      playerEmail = p[0].email
      playerUsername = p[0].username
    }
  }

  return {
    ...r,
    playerEmail,
    playerUsername,
  }
}
