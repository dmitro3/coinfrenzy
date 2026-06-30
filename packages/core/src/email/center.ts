// docs/11 §4 — Email Center (admin one-off send + outbound archive).
//
// This module backs the admin-only Email Center surface. It is the
// "Compose & send a single email right now" feature — distinct from the
// bulk CRM campaign sender (which lives in core/crm/sender.ts) and the
// flow runner (core/crm/flow-runner.ts).
//
// Why a separate module:
//   - Operators routinely need to send a one-off transactional email
//     (an apology, a manual verification nudge, a custom promo to a
//     single VIP) and the campaign builder is overkill for that.
//   - We still want every send to land in `crm_message_log` so the
//     downstream open/click/bounce webhooks tie back the same way.
//   - We still want the suppression list to be honoured by default.
//     Manager+ can override per send for genuinely transactional cases.
//
// Every send writes an audit log entry tying the send to the admin
// actor, the recipient, and the template (if any).

import { and, eq, ilike, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { getR2Client } from '../adapters/r2/index'
import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { dispatchEmail } from '../crm/dispatchers'
import { err, ok, type Result } from '../errors/result'

export type EmailCenterError =
  | { code: 'INVALID'; reason: string }
  | { code: 'SUPPRESSED' }
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'TEMPLATE_NOT_FOUND' }
  | { code: 'DISPATCH_FAILED'; message: string }

export interface SendOneOffInput {
  /** Either toEmail or toPlayerId must be set. If both, toPlayerId wins
   *  and the player's email is looked up. */
  toEmail?: string
  toPlayerId?: string

  subject: string
  bodyHtml: string
  bodyText?: string | null

  /** Optional from address. Defaults to platform default. */
  fromEmail?: string | null
  replyTo?: string | null

  /** Optional template the body was loaded from. Tracked for reporting. */
  templateId?: string | null

  /** Manager+ may override suppression for genuinely transactional sends
   *  (e.g. account closure confirmation). Audited. */
  ignoreSuppression?: boolean
}

export interface SendOneOffResult {
  messageId: string
  recipient: string
  providerMessageId?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function sendOneOffEmail(
  ctx: Context,
  input: SendOneOffInput,
): Promise<Result<SendOneOffResult, EmailCenterError>> {
  if (ctx.actor.kind !== 'admin') {
    return err({ code: 'INVALID' as const, reason: 'admin_only' })
  }

  if (!input.subject || input.subject.trim().length === 0) {
    return err({ code: 'INVALID' as const, reason: 'subject_required' })
  }
  if (input.subject.length > 200) {
    return err({ code: 'INVALID' as const, reason: 'subject_too_long' })
  }
  if (!input.bodyHtml || input.bodyHtml.trim().length === 0) {
    return err({ code: 'INVALID' as const, reason: 'body_required' })
  }
  if (input.bodyHtml.length > 200_000) {
    return err({ code: 'INVALID' as const, reason: 'body_too_long' })
  }

  // Resolve recipient + the player_id we log against. crm_message_log
  // makes player_id NOT NULL — for "external" emails (no matching
  // player), we fall back to logging against a sentinel system row
  // via the chosen admin's id. We still keep the row so it shows in
  // the inbox audit.
  let recipient: string | null = null
  let resolvedPlayerId: string | null = null

  if (input.toPlayerId) {
    const rows = await ctx.db
      .select({ id: schema.players.id, email: schema.players.email })
      .from(schema.players)
      .where(eq(schema.players.id, input.toPlayerId))
      .limit(1)
    if (!rows[0]) return err({ code: 'PLAYER_NOT_FOUND' as const })
    recipient = rows[0].email
    resolvedPlayerId = rows[0].id
  } else if (input.toEmail) {
    const trimmed = input.toEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      return err({ code: 'INVALID' as const, reason: 'invalid_email' })
    }
    recipient = trimmed
    // Best-effort: link to a player row if the email matches one. The
    // open/click webhooks tie back per `provider_message_id` regardless,
    // so this is only for nicer reporting.
    const pRows = await ctx.db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(eq(schema.players.email, trimmed))
      .limit(1)
    if (pRows[0]) resolvedPlayerId = pRows[0].id
  } else {
    return err({ code: 'INVALID' as const, reason: 'recipient_required' })
  }

  if (!recipient || !EMAIL_RE.test(recipient)) {
    return err({ code: 'INVALID' as const, reason: 'invalid_email' })
  }

  // Suppression check — honoured unless explicitly overridden.
  if (!input.ignoreSuppression) {
    const sup = await ctx.db
      .select({ k: schema.crmSuppression.emailOrPhone })
      .from(schema.crmSuppression)
      .where(eq(schema.crmSuppression.emailOrPhone, recipient))
      .limit(1)
    if (sup[0]) return err({ code: 'SUPPRESSED' as const })
  }

  // Template-existence sanity check (we don't render it — the admin has
  // already loaded the body in the compose form — but we still track
  // the template id for reporting).
  if (input.templateId) {
    const t = await ctx.db
      .select({ id: schema.emailTemplates.id })
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, input.templateId))
      .limit(1)
    if (!t[0]) return err({ code: 'TEMPLATE_NOT_FOUND' as const })
  }

  const from = input.fromEmail?.trim() || 'noreply@coinfrenzy.example'

  const dispatch = await dispatchEmail({
    to: recipient,
    from,
    replyTo: input.replyTo ?? undefined,
    subject: input.subject,
    html: input.bodyHtml,
    text: input.bodyText ?? undefined,
  })
  if (!dispatch.ok) {
    return err({ code: 'DISPATCH_FAILED' as const, message: dispatch.error ?? 'unknown' })
  }

  // Log. `player_id` is NOT NULL in the partitioned table, so when we
  // couldn't resolve a player we fall back to the admin's own id — it's
  // an internal traceability column more than a hard FK. (We don't FK
  // the partition table.)
  const insertRow = await ctx.db
    .insert(schema.crmMessageLog)
    .values({
      playerId: resolvedPlayerId ?? ctx.actor.adminId,
      templateId: input.templateId ?? null,
      channel: 'email',
      recipient,
      subject: input.subject,
      bodyPreview: input.bodyHtml.slice(0, 200),
      abVariant: 'one_off_admin',
      status: 'sent',
      sendgridMessageId: dispatch.providerMessageId ?? null,
      queuedAt: new Date(),
      sentAt: new Date(),
    })
    .returning({ id: schema.crmMessageLog.id, createdAt: schema.crmMessageLog.createdAt })

  const logged = insertRow[0]!

  // Archive the full HTML body to R2 for AML / litigation hold. Best-
  // effort: if R2 is unavailable we still complete the send and only
  // record the preview. The detail dialog gates "Show full body" on
  // bodyStorageKey being present.
  try {
    const r2 = getR2Client()
    const created = logged.createdAt
    const yyyy = created.getUTCFullYear()
    const mm = String(created.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(created.getUTCDate()).padStart(2, '0')
    const key = `email-bodies/${yyyy}/${mm}/${dd}/${logged.id}.html`
    await r2.putObject({
      key,
      body: input.bodyHtml,
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'private, max-age=31536000, immutable',
      metadata: {
        recipient,
        // S3 metadata values must be ASCII-safe; subjects can contain
        // emoji etc., so we drop the subject from metadata and rely on
        // the row in crm_message_log for that.
        actorId: ctx.actor.adminId,
      },
    })
    await ctx.db
      .update(schema.crmMessageLog)
      .set({ bodyStorageKey: key })
      .where(
        and(eq(schema.crmMessageLog.id, logged.id), eq(schema.crmMessageLog.createdAt, created)),
      )
  } catch (e) {
    // Swallow — body archive is best-effort. Log via ctx.logger so
    // ops sees the failure but the send succeeds for the player.
    ctx.logger.warn?.('email_center.r2_archive_failed', {
      messageId: logged.id,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: ctx.actor.adminId,
    actorRole: ctx.actor.role,
    action: 'email.one_off_send',
    resourceKind: 'crm_message',
    resourceId: logged.id,
    after: {
      to: recipient,
      subject: input.subject,
      templateId: input.templateId ?? null,
      ignoredSuppression: input.ignoreSuppression === true,
    },
    ip: ctx.actor.ip,
    requestId: ctx.reqId,
  })

  return ok({
    messageId: logged.id,
    recipient,
    providerMessageId: dispatch.providerMessageId,
  })
}

// -------------------------------------------------------------------------
// List + detail reads (used by the admin Email Center page).
// -------------------------------------------------------------------------

export interface InboxFilters {
  search?: string
  status?: string | 'all'
  since?: Date
  until?: Date
  limit?: number
}

export interface InboxRow {
  id: string
  recipient: string
  subject: string | null
  status: string
  createdAt: Date
  sentAt: Date | null
  openedAt: Date | null
  clickedAt: Date | null
  campaignId: string | null
  templateId: string | null
}

export async function listInbox(ctx: Context, filters: InboxFilters = {}): Promise<InboxRow[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500)
  const conds = [eq(schema.crmMessageLog.channel, 'email')]
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`
    conds.push(
      sql`(${ilike(schema.crmMessageLog.recipient, q)} or ${ilike(schema.crmMessageLog.subject, q)})`,
    )
  }
  if (filters.status && filters.status !== 'all') {
    conds.push(eq(schema.crmMessageLog.status, filters.status))
  }
  if (filters.since) {
    conds.push(sql`${schema.crmMessageLog.createdAt} >= ${filters.since.toISOString()}`)
  }
  if (filters.until) {
    conds.push(sql`${schema.crmMessageLog.createdAt} <= ${filters.until.toISOString()}`)
  }

  const rows = await ctx.db
    .select({
      id: schema.crmMessageLog.id,
      recipient: schema.crmMessageLog.recipient,
      subject: schema.crmMessageLog.subject,
      status: schema.crmMessageLog.status,
      createdAt: schema.crmMessageLog.createdAt,
      sentAt: schema.crmMessageLog.sentAt,
      openedAt: schema.crmMessageLog.openedAt,
      clickedAt: schema.crmMessageLog.clickedAt,
      campaignId: schema.crmMessageLog.campaignId,
      templateId: schema.crmMessageLog.templateId,
    })
    .from(schema.crmMessageLog)
    .where(and(...conds))
    .orderBy(sql`${schema.crmMessageLog.createdAt} desc`)
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    recipient: r.recipient,
    subject: r.subject,
    status: r.status,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    openedAt: r.openedAt,
    clickedAt: r.clickedAt,
    campaignId: r.campaignId,
    templateId: r.templateId,
  }))
}

export interface InboxDetail extends InboxRow {
  playerId: string | null
  bodyPreview: string | null
  /** R2 object key when the full body was archived. */
  bodyStorageKey: string | null
  providerMessageId: string | null
  abVariant: string | null
  deliveredAt: Date | null
  errorCode: string | null
  errorMessage: string | null
  /** Joined-in nice display values (templated lookups) — null if missing. */
  templateName: string | null
  playerEmail: string | null
  playerUsername: string | null
}

/**
 * `crm_message_log` is RANGE-partitioned by `created_at` (monthly per
 * docs/03 §9.4). Passing only `id` to the planner means a scan across
 * every partition. The caller already has `createdAt` from the inbox
 * list — threading it through here cuts the query to a single partition.
 *
 * For backwards compatibility (admin pasting a UUID into the URL bar
 * without a date), we fall back to a partition-wide scan only if
 * `createdAt` is omitted. Add `createdAt` to all new callers.
 */
export async function getMessage(
  ctx: Context,
  id: string,
  createdAt?: Date,
): Promise<InboxDetail | null> {
  const conds = [eq(schema.crmMessageLog.id, id)]
  if (createdAt) {
    // Bound the partition window: anchor to the calendar day. We
    // accept a small fuzz to absorb timezone rounding from the URL.
    const lo = new Date(createdAt.getTime() - 24 * 60 * 60 * 1000)
    const hi = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
    conds.push(
      sql`${schema.crmMessageLog.createdAt} BETWEEN ${lo.toISOString()} AND ${hi.toISOString()}`,
    )
  }
  const rows = await ctx.db
    .select({
      id: schema.crmMessageLog.id,
      playerId: schema.crmMessageLog.playerId,
      recipient: schema.crmMessageLog.recipient,
      subject: schema.crmMessageLog.subject,
      bodyPreview: schema.crmMessageLog.bodyPreview,
      bodyStorageKey: schema.crmMessageLog.bodyStorageKey,
      status: schema.crmMessageLog.status,
      sendgridMessageId: schema.crmMessageLog.sendgridMessageId,
      abVariant: schema.crmMessageLog.abVariant,
      campaignId: schema.crmMessageLog.campaignId,
      templateId: schema.crmMessageLog.templateId,
      queuedAt: schema.crmMessageLog.queuedAt,
      sentAt: schema.crmMessageLog.sentAt,
      deliveredAt: schema.crmMessageLog.deliveredAt,
      openedAt: schema.crmMessageLog.openedAt,
      clickedAt: schema.crmMessageLog.clickedAt,
      errorCode: schema.crmMessageLog.errorCode,
      errorMessage: schema.crmMessageLog.errorMessage,
      createdAt: schema.crmMessageLog.createdAt,
    })
    .from(schema.crmMessageLog)
    .where(and(...conds))
    .limit(1)
  const r = rows[0]
  if (!r) return null

  // Best-effort joins (player + template) for nicer display.
  let templateName: string | null = null
  let playerEmail: string | null = null
  let playerUsername: string | null = null
  if (r.templateId) {
    const t = await ctx.db
      .select({ name: schema.emailTemplates.displayName })
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, r.templateId))
      .limit(1)
    templateName = t[0]?.name ?? null
  }
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
    id: r.id,
    playerId: r.playerId,
    recipient: r.recipient,
    subject: r.subject,
    status: r.status,
    bodyPreview: r.bodyPreview,
    bodyStorageKey: r.bodyStorageKey,
    providerMessageId: r.sendgridMessageId,
    abVariant: r.abVariant,
    campaignId: r.campaignId,
    templateId: r.templateId,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    deliveredAt: r.deliveredAt,
    openedAt: r.openedAt,
    clickedAt: r.clickedAt,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    templateName,
    playerEmail,
    playerUsername,
  }
}

/**
 * Resolve a short-lived signed URL to a message's archived full body.
 * Returns null if no body was archived (e.g. SMS, legacy row, R2 was
 * down at send time). The admin route must enforce permissions on top
 * of this; we only generate the URL, not authorise the reveal.
 */
export async function getMessageBodySignedUrl(
  ctx: Context,
  id: string,
  createdAt?: Date,
): Promise<string | null> {
  const conds = [eq(schema.crmMessageLog.id, id)]
  if (createdAt) {
    const lo = new Date(createdAt.getTime() - 24 * 60 * 60 * 1000)
    const hi = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
    conds.push(
      sql`${schema.crmMessageLog.createdAt} BETWEEN ${lo.toISOString()} AND ${hi.toISOString()}`,
    )
  }
  const rows = await ctx.db
    .select({ key: schema.crmMessageLog.bodyStorageKey })
    .from(schema.crmMessageLog)
    .where(and(...conds))
    .limit(1)
  const key = rows[0]?.key
  if (!key) return null
  const r2 = getR2Client()
  return r2.signedGetUrl({ key, expiresIn: 300 })
}
