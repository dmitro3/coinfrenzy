// docs/11 §4.3 + §7 — pre-send eligibility check.
//
// Called for every (player, channel) pair the campaign sender considers.
// Returns the boolean + a reason string (used to update message_log when
// dropping a player).

import { and, eq, gte, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'

export type IneligibilityReason =
  | 'no_consent'
  | 'inactive_status'
  | 'internal_account'
  | 'self_excluded'
  | 'frequency_cap'
  | 'bounce_history'
  | 'suppressed'
  | 'missing_recipient'

export interface EligibilityDecision {
  eligible: boolean
  reason?: IneligibilityReason
}

export async function canReceive(
  ctx: Context,
  args: { playerId: string; channel: 'email' | 'sms' | 'in_app' },
): Promise<EligibilityDecision> {
  const playerRows = await ctx.db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      phone: schema.players.phone,
      status: schema.players.status,
      isInternalAccount: schema.players.isInternalAccount,
      emailConsent: schema.players.emailConsent,
      smsConsent: schema.players.smsConsent,
      crmDailyMax: schema.players.crmDailyMax,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
    })
    .from(schema.players)
    .where(eq(schema.players.id, args.playerId))
    .limit(1)

  const player = playerRows[0]
  if (!player) return { eligible: false, reason: 'inactive_status' }

  if (player.status !== 'active') return { eligible: false, reason: 'inactive_status' }
  if (player.isInternalAccount) return { eligible: false, reason: 'internal_account' }

  if (args.channel === 'email' && !player.emailConsent)
    return { eligible: false, reason: 'no_consent' }
  if (args.channel === 'sms' && !player.smsConsent) return { eligible: false, reason: 'no_consent' }

  if (
    player.rgSelfExcludedUntil &&
    player.rgSelfExcludedUntil > new Date() &&
    args.channel !== 'in_app'
  ) {
    return { eligible: false, reason: 'self_excluded' }
  }

  // Recipient check + suppression list lookup.
  let recipient: string | null = null
  if (args.channel === 'email') recipient = player.email
  if (args.channel === 'sms') recipient = player.phone
  if (args.channel === 'in_app') recipient = player.id
  if (!recipient) return { eligible: false, reason: 'missing_recipient' }

  if (args.channel === 'email' || args.channel === 'sms') {
    const suppression = await ctx.db
      .select({ key: schema.crmSuppression.emailOrPhone })
      .from(schema.crmSuppression)
      .where(eq(schema.crmSuppression.emailOrPhone, recipient.toLowerCase()))
      .limit(1)
    if (suppression.length > 0) return { eligible: false, reason: 'suppressed' }
  }

  // Frequency cap — recent sends in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const countRows = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.crmMessageLog)
    .where(
      and(
        eq(schema.crmMessageLog.playerId, args.playerId),
        eq(schema.crmMessageLog.channel, args.channel),
        gte(schema.crmMessageLog.createdAt, since),
      ),
    )
  const recentSends = Number(countRows[0]?.count ?? 0)
  if (recentSends >= (player.crmDailyMax ?? 3)) {
    return { eligible: false, reason: 'frequency_cap' }
  }

  // Hard-bounce gate — 3 bounces in 90 days.
  const bounceCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const bounceRows = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.crmMessageLog)
    .where(
      and(
        eq(schema.crmMessageLog.playerId, args.playerId),
        eq(schema.crmMessageLog.channel, args.channel),
        eq(schema.crmMessageLog.status, 'bounced'),
        gte(schema.crmMessageLog.createdAt, bounceCutoff),
      ),
    )
  if (Number(bounceRows[0]?.count ?? 0) >= 3) {
    return { eligible: false, reason: 'bounce_history' }
  }

  return { eligible: true }
}
