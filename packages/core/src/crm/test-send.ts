// docs/11 §4 — admin "Test send to me" service.
//
// Used by every send surface in the admin (template editor, campaign
// wizard step 3 + step 5, flow node config). The send goes to the
// currently logged-in admin's email or phone with the *real* template
// rendered against a chosen sample player — this is the marketing
// equivalent of "preview in production".
//
// Critical behaviours:
//   - Bypass the suppression list (it's the admin's own address)
//   - Bypass eligibility/frequency caps (admin opted in)
//   - Log to crm_message_log with a marker so analytics excludes it
//   - Audit_log entry per send (ties to the actor)

import { sql } from 'drizzle-orm'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { dispatchEmail, dispatchSms } from './dispatchers'
import { fetchExtendedPlayerContext, renderPreview } from './preview'

export type TestSendError =
  | { code: 'TEMPLATE_NOT_FOUND' }
  | { code: 'NO_ADMIN_TARGET' }
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'DISPATCH_FAILED'; message: string }

export interface TestSendInput {
  channel: 'email' | 'sms'
  templateId: string
  /** Sample player id — variables resolve against this player. */
  samplePlayerId: string
  /** Admin email override (defaults to admin's email on file). */
  adminEmailOverride?: string
  adminPhoneOverride?: string
}

export interface TestSendResult {
  delivered: boolean
  providerMessageId?: string
  rendered: string
  variablesMissing: string[]
}

export async function sendAdminTest(
  ctx: Context,
  input: TestSendInput,
): Promise<Result<TestSendResult, TestSendError>> {
  if (ctx.actor.kind !== 'admin') {
    return err({ code: 'NO_ADMIN_TARGET' as const })
  }

  const adminRow = (await ctx.db.execute(sql`
    SELECT email, display_name FROM admins WHERE id = ${ctx.actor.adminId} LIMIT 1
  `)) as unknown as Array<{ email: string; display_name: string }>
  const admin = adminRow[0]
  if (!admin) return err({ code: 'NO_ADMIN_TARGET' as const })

  const player = await fetchExtendedPlayerContext(ctx, input.samplePlayerId)
  if (!player) return err({ code: 'PLAYER_NOT_FOUND' as const })

  if (input.channel === 'email') {
    const to = input.adminEmailOverride ?? admin.email
    if (!to) return err({ code: 'NO_ADMIN_TARGET' as const })

    const tplRows = (await ctx.db.execute(sql`
      SELECT subject_template, body_html_template, body_text_template, from_email, reply_to, display_name
      FROM email_templates WHERE id = ${input.templateId} LIMIT 1
    `)) as unknown as Array<{
      subject_template: string
      body_html_template: string
      body_text_template: string | null
      from_email: string | null
      reply_to: string | null
      display_name: string
    }>
    const tpl = tplRows[0]
    if (!tpl) return err({ code: 'TEMPLATE_NOT_FOUND' as const })

    const subjectRender = renderPreview(tpl.subject_template, player, { channel: 'email' })
    const htmlRender = renderPreview(tpl.body_html_template, player, {
      channel: 'email',
      noEscape: true,
    })
    const textRender = tpl.body_text_template
      ? renderPreview(tpl.body_text_template, player, { channel: 'email', noEscape: true }).rendered
      : null

    const dispatch = await dispatchEmail({
      to,
      from: tpl.from_email ?? 'noreply@coinfrenzy.example',
      replyTo: tpl.reply_to,
      subject: `[TEST] ${subjectRender.rendered}`,
      html: htmlRender.rendered,
      text: textRender,
    })

    if (!dispatch.ok) {
      return err({
        code: 'DISPATCH_FAILED' as const,
        message: dispatch.error ?? 'unknown',
      })
    }

    await ctx.db.execute(sql`
      INSERT INTO crm_message_log (
        id, player_id, template_id, channel, recipient, subject, body_preview, status,
        sendgrid_message_id, queued_at, sent_at, ab_variant, created_at
      ) VALUES (
        gen_random_uuid(), ${input.samplePlayerId}, ${input.templateId}, 'email', ${to},
        ${`[TEST] ${subjectRender.rendered}`}, ${htmlRender.rendered.slice(0, 200)}, 'sent',
        ${dispatch.providerMessageId ?? null}, NOW(), NOW(), 'test_send', NOW()
      )
    `)

    await writeAuditEntry(ctx.db, {
      actorKind: 'admin',
      action: 'crm.test_send',
      resourceKind: 'email_template',
      resourceId: input.templateId,
      after: { to, samplePlayer: input.samplePlayerId, channel: 'email' },
    })

    return ok({
      delivered: true,
      providerMessageId: dispatch.providerMessageId,
      rendered: htmlRender.rendered,
      variablesMissing: [
        ...new Set([...subjectRender.variablesMissing, ...htmlRender.variablesMissing]),
      ],
    })
  }

  // SMS
  const adminPhoneRow = (await ctx.db.execute(sql`
    SELECT email FROM admins WHERE id = ${ctx.actor.adminId} LIMIT 1
  `)) as unknown as Array<{ email: string }>
  void adminPhoneRow
  const to = input.adminPhoneOverride
  if (!to) return err({ code: 'NO_ADMIN_TARGET' as const })

  const smsRows = (await ctx.db.execute(sql`
    SELECT body_template, display_name FROM sms_templates WHERE id = ${input.templateId} LIMIT 1
  `)) as unknown as Array<{ body_template: string; display_name: string }>
  const sms = smsRows[0]
  if (!sms) return err({ code: 'TEMPLATE_NOT_FOUND' as const })

  const bodyRender = renderPreview(sms.body_template, player, { channel: 'sms' })
  const dispatch = await dispatchSms({ to, body: `[TEST] ${bodyRender.rendered}` })
  if (!dispatch.ok) {
    return err({ code: 'DISPATCH_FAILED' as const, message: dispatch.error ?? 'unknown' })
  }

  await ctx.db.execute(sql`
    INSERT INTO crm_message_log (
      id, player_id, template_id, channel, recipient, body_preview, status,
      twilio_message_sid, queued_at, sent_at, ab_variant, created_at
    ) VALUES (
      gen_random_uuid(), ${input.samplePlayerId}, ${input.templateId}, 'sms', ${to},
      ${bodyRender.rendered.slice(0, 200)}, 'sent',
      ${dispatch.providerMessageId ?? null}, NOW(), NOW(), 'test_send', NOW()
    )
  `)

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.test_send',
    resourceKind: 'sms_template',
    resourceId: input.templateId,
    after: { to, samplePlayer: input.samplePlayerId, channel: 'sms' },
  })

  return ok({
    delivered: true,
    providerMessageId: dispatch.providerMessageId,
    rendered: bodyRender.rendered,
    variablesMissing: bodyRender.variablesMissing,
  })
}
