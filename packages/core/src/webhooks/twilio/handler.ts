import { eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../context'
import { recordPlayerEvent } from '../../events/index'

// docs/05 §7.2 — inbound + status webhook handlers. Inbound STOP/HELP
// keywords flip sms_consent off + add a suppression row (TCPA compliance).

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])

export async function handleTwilioInbound(
  ctx: Context,
  raw: Record<string, string>,
): Promise<void> {
  const from = raw.From ?? ''
  const body = (raw.Body ?? '').trim().toUpperCase()
  if (!from) return

  if (STOP_KEYWORDS.has(body)) {
    const playerRows = await ctx.db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(sql`${schema.players.phone} = ${from}`)
      .limit(1)
    const player = playerRows[0]
    if (player) {
      await ctx.db
        .update(schema.players)
        .set({ smsConsent: false, updatedAt: new Date() })
        .where(eq(schema.players.id, player.id))
      await ctx.db
        .insert(schema.crmSuppression)
        .values({ emailOrPhone: from, reason: 'TCPA STOP keyword', source: 'tcpa_stop' })
        .onConflictDoNothing()
      await recordPlayerEvent(ctx.db, {
        playerId: player.id,
        eventName: 'player.sms.unsubscribe',
        eventCategory: 'crm',
        payload: { from, body: raw.Body },
      })
    }
    return
  }

  if (body === 'HELP') return

  // Other inbound messages route to support — schema for support_tickets
  // lands in a later prompt. We log for now.
  ctx.logger.info('twilio_inbound_unrouted', { from, body: raw.Body })
}

export async function handleTwilioStatus(ctx: Context, raw: Record<string, string>): Promise<void> {
  const sid = raw.MessageSid ?? raw.SmsSid
  const status = (raw.MessageStatus ?? '').toLowerCase()
  if (!sid) return

  const mappedStatus = mapStatus(status)
  await ctx.db
    .update(schema.crmMessageLog)
    .set({
      status: mappedStatus,
      deliveredAt: status === 'delivered' ? new Date() : undefined,
      errorCode: status === 'failed' || status === 'undelivered' ? status : null,
    })
    .where(eq(schema.crmMessageLog.twilioMessageSid, sid))
}

function mapStatus(value: string): string {
  switch (value) {
    case 'sent':
    case 'queued':
    case 'sending':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'failed':
    case 'undelivered':
      return 'bounced'
    default:
      return 'sent'
  }
}
