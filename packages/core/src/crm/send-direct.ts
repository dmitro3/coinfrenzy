// docs/08 §6 + docs/11 §4 — admin one-off direct send.
//
// Lets a support / manager admin send a single email or SMS to a specific
// player without scheduling a campaign. Resolves the template, renders
// the player-variable context, dispatches via SendGrid / Twilio, and
// writes a row to `crm_message_log` (NULL campaign_id) so the message
// shows up in the player profile timeline and the global Message Log.
//
// Idempotency: each call writes a fresh log row. The admin UI guards
// against double-clicks; the underlying provider is best-effort.

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { writeAuditEntry } from '../audit/index'
import { err, ok, type Result } from '../errors/result'

import { dispatchEmail, dispatchSms } from './dispatchers'
import {
  buildPlayerVariableContext,
  getEmailTemplateBySlug,
  getSmsTemplateBySlug,
  renderPlaintextTemplate,
  renderTemplate,
} from './templates'

export type DirectChannel = 'email' | 'sms'

export interface SendDirectMessageInput {
  /** Player to message. */
  playerId: string
  channel: DirectChannel
  /** Template slug (current version is resolved). */
  templateSlug: string
  /** Optional admin override for the subject (email only). */
  subjectOverride?: string | null
  /** Optional admin override for the rendered body (raw, post-render). */
  bodyOverride?: string | null
  /** If true, send to the admin's email instead of the player. */
  testSendToSelf?: boolean
  /** Email override used when testSendToSelf=true. */
  selfEmail?: string | null
}

export interface SendDirectMessageOutput {
  messageLogId: string
  status: 'sent' | 'failed' | 'logged'
  providerMessageId: string | null
  error: string | null
  recipient: string
  templateId: string
  channel: DirectChannel
}

export type SendDirectError =
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'TEMPLATE_NOT_FOUND' }
  | { code: 'NO_RECIPIENT' }
  | { code: 'CHANNEL_SUPPRESSED' }

export async function sendDirectMessage(
  ctx: Context,
  input: SendDirectMessageInput,
): Promise<Result<SendDirectMessageOutput, SendDirectError>> {
  // 1. Player lookup.
  const playerRows = await ctx.db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      phone: schema.players.phone,
      status: schema.players.status,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)
  if (!playerRows[0]) return err({ code: 'PLAYER_NOT_FOUND' as const })
  const player = playerRows[0]

  // 2. Recipient resolution.
  const liveRecipient = input.channel === 'sms' ? player.phone : player.email
  if (!liveRecipient) return err({ code: 'NO_RECIPIENT' as const })
  const recipient = input.testSendToSelf
    ? input.channel === 'sms'
      ? liveRecipient
      : (input.selfEmail ?? liveRecipient)
    : liveRecipient

  // 3. Suppression check. The crm_suppression table is keyed by
  // email_or_phone — we check both channels against it.
  if (!input.testSendToSelf) {
    const suppressed = await ctx.db
      .select({ key: schema.crmSuppression.emailOrPhone })
      .from(schema.crmSuppression)
      .where(eq(schema.crmSuppression.emailOrPhone, recipient.toLowerCase()))
      .limit(1)
    if (suppressed[0]) return err({ code: 'CHANNEL_SUPPRESSED' as const })
  }

  // 4. Render.
  const renderCtxResult = await buildPlayerVariableContext(ctx, player.id)
  if (!renderCtxResult.ok) return err({ code: 'PLAYER_NOT_FOUND' as const })
  const renderCtx = { player: renderCtxResult.value }

  if (input.channel === 'email') {
    const tplR = await getEmailTemplateBySlug(ctx, input.templateSlug)
    if (!tplR.ok) return err({ code: 'TEMPLATE_NOT_FOUND' as const })
    const tpl = tplR.value
    const subject = input.subjectOverride ?? renderTemplate(tpl.subjectTemplate, renderCtx)
    const html = input.bodyOverride ?? renderTemplate(tpl.bodyHtmlTemplate, renderCtx)
    const text = tpl.bodyTextTemplate
      ? renderPlaintextTemplate(tpl.bodyTextTemplate, renderCtx)
      : null

    const inserted = await ctx.db
      .insert(schema.crmMessageLog)
      .values({
        playerId: player.id,
        templateId: tpl.id,
        channel: 'email',
        recipient,
        subject,
        bodyPreview: html.slice(0, 200),
        status: 'queued',
        queuedAt: new Date(),
      })
      .returning({ id: schema.crmMessageLog.id })
    const logId = inserted[0]!.id

    const dispatch = await dispatchEmail({
      to: recipient,
      from: tpl.fromEmail ?? 'noreply@coinfrenzy.com',
      replyTo: tpl.replyTo ?? null,
      subject,
      html,
      text,
      trackingId: logId,
    })
    const finalStatus: 'sent' | 'failed' = dispatch.ok ? 'sent' : 'failed'

    await ctx.db
      .update(schema.crmMessageLog)
      .set({
        status: finalStatus,
        sendgridMessageId: dispatch.providerMessageId ?? null,
        errorMessage: dispatch.error ?? null,
        sentAt: dispatch.ok ? new Date() : null,
      })
      .where(eq(schema.crmMessageLog.id, logId))

    await writeAuditEntry(ctx.db, {
      actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
      action: input.testSendToSelf ? 'player.send_message_test' : 'player.send_message',
      resourceKind: 'player',
      resourceId: player.id,
      after: {
        channel: 'email',
        template_slug: input.templateSlug,
        to: recipient,
        status: finalStatus,
        sendgrid_message_id: dispatch.providerMessageId,
      },
    })

    return ok({
      messageLogId: logId,
      status: finalStatus,
      providerMessageId: dispatch.providerMessageId ?? null,
      error: dispatch.error ?? null,
      recipient,
      templateId: tpl.id,
      channel: 'email',
    })
  }

  // SMS branch.
  const tplR = await getSmsTemplateBySlug(ctx, input.templateSlug)
  if (!tplR.ok) return err({ code: 'TEMPLATE_NOT_FOUND' as const })
  const tpl = tplR.value
  const body = input.bodyOverride ?? renderPlaintextTemplate(tpl.bodyTemplate, renderCtx)

  const inserted = await ctx.db
    .insert(schema.crmMessageLog)
    .values({
      playerId: player.id,
      templateId: tpl.id,
      channel: 'sms',
      recipient,
      bodyPreview: body.slice(0, 200),
      status: 'queued',
      queuedAt: new Date(),
    })
    .returning({ id: schema.crmMessageLog.id })
  const logId = inserted[0]!.id

  const dispatch = await dispatchSms({ to: recipient, body, trackingId: logId })
  const finalStatus: 'sent' | 'failed' = dispatch.ok ? 'sent' : 'failed'

  await ctx.db
    .update(schema.crmMessageLog)
    .set({
      status: finalStatus,
      twilioMessageSid: dispatch.providerMessageId ?? null,
      errorMessage: dispatch.error ?? null,
      sentAt: dispatch.ok ? new Date() : null,
    })
    .where(eq(schema.crmMessageLog.id, logId))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    action: input.testSendToSelf ? 'player.send_message_test' : 'player.send_message',
    resourceKind: 'player',
    resourceId: player.id,
    after: {
      channel: 'sms',
      template_slug: input.templateSlug,
      to: recipient,
      status: finalStatus,
      twilio_message_sid: dispatch.providerMessageId,
    },
  })

  return ok({
    messageLogId: logId,
    status: finalStatus,
    providerMessageId: dispatch.providerMessageId ?? null,
    error: dispatch.error ?? null,
    recipient,
    templateId: tpl.id,
    channel: 'sms',
  })
}
