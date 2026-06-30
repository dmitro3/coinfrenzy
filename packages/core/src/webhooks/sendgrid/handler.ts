import { eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../../context'
import { recordPlayerEvent } from '../../events/index'

// docs/05 §7.1 — SendGrid event batch. We update crm_message_log by
// sg_message_id when present, and flip player.email_consent off on
// unsubscribe/spam events.

interface SendGridEvent {
  event:
    | 'processed'
    | 'delivered'
    | 'open'
    | 'click'
    | 'bounce'
    | 'dropped'
    | 'deferred'
    | 'spamreport'
    | 'unsubscribe'
    | 'group_unsubscribe'
    | string
  email: string
  sg_event_id?: string
  sg_message_id?: string
  timestamp?: number
  reason?: string
  template_id?: string
  category?: string | string[]
}

export async function handleSendGridEventBatch(
  ctx: Context,
  payload: SendGridEvent | SendGridEvent[],
): Promise<void> {
  const events = Array.isArray(payload) ? payload : [payload]

  for (const event of events) {
    const messageId = event.sg_message_id ?? null
    const status = mapEventToStatus(event.event)

    if (messageId) {
      await ctx.db
        .update(schema.crmMessageLog)
        .set({
          status,
          deliveredAt:
            event.event === 'delivered'
              ? new Date(event.timestamp ? event.timestamp * 1000 : Date.now())
              : undefined,
          openedAt:
            event.event === 'open'
              ? new Date(event.timestamp ? event.timestamp * 1000 : Date.now())
              : undefined,
          clickedAt:
            event.event === 'click'
              ? new Date(event.timestamp ? event.timestamp * 1000 : Date.now())
              : undefined,
          errorCode: event.event === 'bounce' || event.event === 'dropped' ? event.event : null,
          errorMessage: event.reason ?? null,
        })
        .where(eq(schema.crmMessageLog.sendgridMessageId, messageId))
    }

    // Per docs/11 §7.2, unsubscribe / spam flip email_consent off and add
    // a suppression row. We look up the player by email.
    if (
      event.event === 'unsubscribe' ||
      event.event === 'group_unsubscribe' ||
      event.event === 'spamreport'
    ) {
      const playerRows = await ctx.db
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(sql`lower(${schema.players.email}) = lower(${event.email})`)
        .limit(1)
      const player = playerRows[0]
      if (player) {
        await ctx.db
          .update(schema.players)
          .set({ emailConsent: false, updatedAt: new Date() })
          .where(eq(schema.players.id, player.id))
        await ctx.db
          .insert(schema.crmSuppression)
          .values({
            emailOrPhone: event.email.toLowerCase(),
            reason: event.event,
            source: event.event === 'spamreport' ? 'complaint' : 'unsubscribe',
          })
          .onConflictDoNothing()

        await recordPlayerEvent(ctx.db, {
          playerId: player.id,
          eventName: `player.email.${event.event}`,
          eventCategory: 'crm',
          payload: { email: event.email, reason: event.reason },
        })
      }
    }
  }
}

function mapEventToStatus(event: string): string {
  switch (event) {
    case 'processed':
      return 'queued'
    case 'delivered':
      return 'delivered'
    case 'open':
      return 'opened'
    case 'click':
      return 'clicked'
    case 'bounce':
    case 'dropped':
    case 'deferred':
      return 'bounced'
    case 'spamreport':
      return 'spam'
    case 'unsubscribe':
    case 'group_unsubscribe':
      return 'unsubscribed'
    default:
      return 'sent'
  }
}
