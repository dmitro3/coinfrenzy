// docs/11 §4 — campaign engine.
//
// The campaign object owns: target segment, channel, template (or A/B
// pair), schedule, conversion config, and counters. The send pipeline is
// resumable: each step writes to crm_message_log so a crashed worker can
// pick up where it left off.

import { and, desc, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { canReceive } from './eligibility'
import { dispatchEmail, dispatchSms } from './dispatchers'
import { listPlayerIds } from './segments'
import {
  buildPlayerVariableContext,
  getEmailTemplate,
  getSmsTemplate,
  renderTemplate,
  renderPlaintextTemplate,
  type RenderContext,
} from './templates'

export type CampaignError =
  | { code: 'NOT_FOUND' }
  | { code: 'INVALID_STATUS'; current: string }
  | { code: 'NO_TEMPLATE' }
  | { code: 'NO_SEGMENT' }
  | { code: 'INVALID' }

export interface CreateCampaignInput {
  name: string
  description?: string | null
  segmentId: string
  channel: 'email' | 'sms' | 'in_app'
  templateId: string
  abVariantATemplateId?: string | null
  abVariantBTemplateId?: string | null
  abSplitPct?: number | null
  abWinnerMetric?: 'open_rate' | 'click_rate' | 'conversion' | null
  scheduledFor?: Date | null
  conversionEvent?: string | null
  conversionWindowHours?: number | null
}

export async function createCampaign(
  ctx: Context,
  input: CreateCampaignInput,
): Promise<Result<{ id: string }, CampaignError>> {
  if (input.abVariantATemplateId && input.abVariantBTemplateId && !input.abSplitPct) {
    return err({ code: 'INVALID' as const })
  }

  const inserted = await ctx.db
    .insert(schema.crmCampaigns)
    .values({
      name: input.name,
      description: input.description ?? null,
      segmentId: input.segmentId,
      channel: input.channel,
      templateId: input.templateId,
      abVariantATemplateId: input.abVariantATemplateId ?? null,
      abVariantBTemplateId: input.abVariantBTemplateId ?? null,
      abSplitPct: input.abSplitPct ?? null,
      abWinnerMetric: input.abWinnerMetric ?? null,
      scheduledFor: input.scheduledFor ?? null,
      conversionEvent: input.conversionEvent ?? null,
      conversionWindowHours: input.conversionWindowHours ?? 168,
      status: input.scheduledFor ? 'scheduled' : 'draft',
      createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning({ id: schema.crmCampaigns.id })

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.campaign.create',
    resourceKind: 'crm_campaign',
    resourceId: inserted[0]!.id,
    after: { name: input.name, channel: input.channel },
  })

  return ok({ id: inserted[0]!.id })
}

export async function scheduleCampaign(
  ctx: Context,
  campaignId: string,
  scheduledFor: Date,
): Promise<Result<void, CampaignError>> {
  const updated = await ctx.db
    .update(schema.crmCampaigns)
    .set({ scheduledFor, status: 'scheduled', updatedAt: new Date() })
    .where(and(eq(schema.crmCampaigns.id, campaignId), eq(schema.crmCampaigns.status, 'draft')))
    .returning({ id: schema.crmCampaigns.id })
  if (!updated[0]) return err({ code: 'INVALID_STATUS' as const, current: 'draft_required' })

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.campaign.schedule',
    resourceKind: 'crm_campaign',
    resourceId: campaignId,
    after: { scheduledFor: scheduledFor.toISOString() },
  })

  return ok(undefined)
}

export async function cancelCampaign(
  ctx: Context,
  campaignId: string,
): Promise<Result<void, CampaignError>> {
  const updated = await ctx.db
    .update(schema.crmCampaigns)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(schema.crmCampaigns.id, campaignId))
    .returning({ id: schema.crmCampaigns.id, status: schema.crmCampaigns.status })

  if (!updated[0]) return err({ code: 'NOT_FOUND' as const })

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.campaign.cancel',
    resourceKind: 'crm_campaign',
    resourceId: campaignId,
  })

  return ok(undefined)
}

export interface DispatchToOnePlayerOptions {
  /** Override the player's normal segment-resolved render context (for previews). */
  overrideRenderContext?: RenderContext
  /** When set, do everything except actually call the provider. Used by previews. */
  dryRun?: boolean
}

/**
 * Send a single campaign message to a single player. Returns the message
 * log id on success. Used by both the bulk sender and the preview API.
 */
export async function sendOneCampaignMessage(
  ctx: Context,
  args: { campaignId: string; playerId: string },
  opts: DispatchToOnePlayerOptions = {},
): Promise<Result<{ messageLogId: string; status: string }, CampaignError>> {
  const campaignRows = await ctx.db
    .select()
    .from(schema.crmCampaigns)
    .where(eq(schema.crmCampaigns.id, args.campaignId))
    .limit(1)
  const campaign = campaignRows[0]
  if (!campaign) return err({ code: 'NOT_FOUND' as const })

  const channel = campaign.channel as 'email' | 'sms' | 'in_app'

  // A/B pick.
  let templateId = campaign.templateId ?? null
  let variant: 'a' | 'b' | null = null
  if (campaign.abVariantATemplateId && campaign.abVariantBTemplateId) {
    const split = campaign.abSplitPct ?? 50
    if (Math.random() * 100 < split) {
      templateId = campaign.abVariantATemplateId
      variant = 'a'
    } else {
      templateId = campaign.abVariantBTemplateId
      variant = 'b'
    }
  }
  if (!templateId) return err({ code: 'NO_TEMPLATE' as const })

  // Eligibility (skipped for dryRun previews).
  if (!opts.dryRun) {
    const decision = await canReceive(ctx, { playerId: args.playerId, channel })
    if (!decision.eligible) {
      const insertedSkip = await ctx.db
        .insert(schema.crmMessageLog)
        .values({
          playerId: args.playerId,
          campaignId: campaign.id,
          templateId,
          channel,
          recipient: args.playerId,
          status: 'failed',
          errorCode: decision.reason ?? 'ineligible',
          errorMessage: 'eligibility check failed',
          abVariant: variant,
          queuedAt: new Date(),
        })
        .returning({ id: schema.crmMessageLog.id })
      return ok({ messageLogId: insertedSkip[0]!.id, status: 'failed' })
    }
  }

  // Render context.
  let renderCtx: RenderContext
  if (opts.overrideRenderContext) {
    renderCtx = opts.overrideRenderContext
  } else {
    const resolved = await buildPlayerVariableContext(ctx, args.playerId)
    if (!resolved.ok) return err({ code: 'NOT_FOUND' as const })
    renderCtx = { player: resolved.value }
  }

  // Render + dispatch.
  if (channel === 'email') {
    const tplResult = await getEmailTemplate(ctx, templateId)
    if (!tplResult.ok) return err({ code: 'NO_TEMPLATE' as const })
    const tpl = tplResult.value
    const subject = renderTemplate(tpl.subjectTemplate, renderCtx)
    const html = renderTemplate(tpl.bodyHtmlTemplate, renderCtx)
    const text = tpl.bodyTextTemplate
      ? renderPlaintextTemplate(tpl.bodyTextTemplate, renderCtx)
      : null
    const recipient = await getEmailRecipient(ctx, args.playerId)
    if (!recipient) return err({ code: 'INVALID' as const })

    const inserted = await ctx.db
      .insert(schema.crmMessageLog)
      .values({
        playerId: args.playerId,
        campaignId: campaign.id,
        templateId,
        channel: 'email',
        recipient,
        subject,
        bodyPreview: html.slice(0, 200),
        status: 'queued',
        abVariant: variant,
        queuedAt: new Date(),
      })
      .returning({ id: schema.crmMessageLog.id })
    const logId = inserted[0]!.id

    if (opts.dryRun) {
      await ctx.db
        .update(schema.crmMessageLog)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(schema.crmMessageLog.id, logId))
      return ok({ messageLogId: logId, status: 'preview' })
    }

    const dispatch = await dispatchEmail({
      to: recipient,
      from: tpl.fromEmail ?? 'noreply@coinfrenzy.com',
      replyTo: tpl.replyTo,
      subject,
      html,
      text,
      trackingId: logId,
    })

    await ctx.db
      .update(schema.crmMessageLog)
      .set({
        status: dispatch.ok ? 'sent' : 'failed',
        sendgridMessageId: dispatch.providerMessageId ?? null,
        errorMessage: dispatch.error ?? null,
        sentAt: dispatch.ok ? new Date() : undefined,
      })
      .where(eq(schema.crmMessageLog.id, logId))

    return ok({ messageLogId: logId, status: dispatch.ok ? 'sent' : 'failed' })
  }

  if (channel === 'sms') {
    const tplResult = await getSmsTemplate(ctx, templateId)
    if (!tplResult.ok) return err({ code: 'NO_TEMPLATE' as const })
    const tpl = tplResult.value
    const body = renderPlaintextTemplate(tpl.bodyTemplate, renderCtx)
    const recipient = await getSmsRecipient(ctx, args.playerId)
    if (!recipient) return err({ code: 'INVALID' as const })

    const inserted = await ctx.db
      .insert(schema.crmMessageLog)
      .values({
        playerId: args.playerId,
        campaignId: campaign.id,
        templateId,
        channel: 'sms',
        recipient,
        bodyPreview: body.slice(0, 200),
        status: 'queued',
        abVariant: variant,
        queuedAt: new Date(),
      })
      .returning({ id: schema.crmMessageLog.id })
    const logId = inserted[0]!.id

    if (opts.dryRun) {
      await ctx.db
        .update(schema.crmMessageLog)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(schema.crmMessageLog.id, logId))
      return ok({ messageLogId: logId, status: 'preview' })
    }

    const dispatch = await dispatchSms({ to: recipient, body, trackingId: logId })

    await ctx.db
      .update(schema.crmMessageLog)
      .set({
        status: dispatch.ok ? 'sent' : 'failed',
        twilioMessageSid: dispatch.providerMessageId ?? null,
        errorMessage: dispatch.error ?? null,
        sentAt: dispatch.ok ? new Date() : undefined,
      })
      .where(eq(schema.crmMessageLog.id, logId))

    return ok({ messageLogId: logId, status: dispatch.ok ? 'sent' : 'failed' })
  }

  // in_app channel — write a notifications row.
  const tplResult = await getEmailTemplate(ctx, templateId)
  if (!tplResult.ok) return err({ code: 'NO_TEMPLATE' as const })
  const tpl = tplResult.value
  const title = renderPlaintextTemplate(tpl.subjectTemplate, renderCtx)
  const body = renderPlaintextTemplate(tpl.bodyTextTemplate ?? tpl.bodyHtmlTemplate, renderCtx)

  await ctx.db.insert(schema.notifications).values({
    playerId: args.playerId,
    title,
    body,
    category: 'crm',
    sourceKind: 'campaign',
    sourceId: campaign.id,
  })
  const inserted = await ctx.db
    .insert(schema.crmMessageLog)
    .values({
      playerId: args.playerId,
      campaignId: campaign.id,
      templateId,
      channel: 'in_app',
      recipient: args.playerId,
      bodyPreview: body.slice(0, 200),
      status: 'sent',
      abVariant: variant,
      queuedAt: new Date(),
      sentAt: new Date(),
      deliveredAt: new Date(),
    })
    .returning({ id: schema.crmMessageLog.id })

  return ok({ messageLogId: inserted[0]!.id, status: 'sent' })
}

/**
 * Bulk send: resolve segment, walk players, dispatch, update counters. Run
 * by the worker on schedule. Idempotent at the message_log level: if the
 * worker crashes mid-batch, restarting picks up only players without a log
 * row for this campaign.
 */
export async function runCampaignSend(
  ctx: Context,
  campaignId: string,
): Promise<Result<{ sent: number; skipped: number }, CampaignError>> {
  const campaignRows = await ctx.db
    .select()
    .from(schema.crmCampaigns)
    .where(eq(schema.crmCampaigns.id, campaignId))
    .limit(1)
  const campaign = campaignRows[0]
  if (!campaign) return err({ code: 'NOT_FOUND' as const })

  if (campaign.status === 'sent' || campaign.status === 'cancelled') {
    return err({ code: 'INVALID_STATUS' as const, current: campaign.status })
  }
  if (!campaign.segmentId) return err({ code: 'NO_SEGMENT' as const })

  await ctx.db
    .update(schema.crmCampaigns)
    .set({ status: 'sending', sentStartedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.crmCampaigns.id, campaignId))

  const segmentRows = await ctx.db
    .select()
    .from(schema.crmSegments)
    .where(eq(schema.crmSegments.id, campaign.segmentId))
    .limit(1)
  const segment = segmentRows[0]
  if (!segment) return err({ code: 'NOT_FOUND' as const })

  const playerList = await listPlayerIds(ctx, segment.filterTree)
  if (!playerList.ok) return err({ code: 'INVALID' as const })
  const playerIds = playerList.value.ids

  await ctx.db
    .update(schema.crmCampaigns)
    .set({ segmentSnapshotCount: playerIds.length, recipientsCount: playerIds.length })
    .where(eq(schema.crmCampaigns.id, campaignId))

  // Skip players already logged for this campaign (resume after crash).
  const existingRows = (await ctx.db
    .select({ playerId: schema.crmMessageLog.playerId })
    .from(schema.crmMessageLog)
    .where(eq(schema.crmMessageLog.campaignId, campaignId))) as Array<{ playerId: string }>
  const sentSet = new Set(existingRows.map((r) => r.playerId))

  let sent = 0
  let skipped = 0
  for (const playerId of playerIds) {
    if (sentSet.has(playerId)) {
      skipped += 1
      continue
    }
    const result = await sendOneCampaignMessage(ctx, { campaignId, playerId })
    if (result.ok) {
      if (result.value.status === 'sent') sent += 1
      else skipped += 1
    } else {
      skipped += 1
    }
  }

  await ctx.db
    .update(schema.crmCampaigns)
    .set({
      status: 'sent',
      sentCompletedAt: new Date(),
      sentCount: sent,
      eligibleCount: sent,
      updatedAt: new Date(),
    })
    .where(eq(schema.crmCampaigns.id, campaignId))

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'crm.campaign.send_completed',
    resourceKind: 'crm_campaign',
    resourceId: campaignId,
    metadata: { sent, skipped, recipients: playerIds.length },
  })

  return ok({ sent, skipped })
}

/**
 * Recompute campaign counters from crm_message_log. Used by the
 * publish-dashboard-counters worker and by the campaign stats page.
 */
export async function recomputeCampaignCounters(ctx: Context, campaignId: string): Promise<void> {
  const counts = await ctx.db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('failed')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) AS delivered_count,
      COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened_count,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked_count,
      COUNT(*) FILTER (WHERE status = 'bounced') AS bounced_count,
      COUNT(*) FILTER (WHERE status = 'unsubscribed') AS unsub_count,
      COUNT(*) FILTER (WHERE conversion_at IS NOT NULL) AS conversion_count
    FROM crm_message_log
    WHERE campaign_id = ${campaignId}
  `)
  const row = (counts as unknown as Array<Record<string, string>>)[0]
  if (!row) return
  await ctx.db
    .update(schema.crmCampaigns)
    .set({
      sentCount: Number(row.sent_count ?? 0),
      deliveredCount: Number(row.delivered_count ?? 0),
      openedCount: Number(row.opened_count ?? 0),
      clickedCount: Number(row.clicked_count ?? 0),
      bouncedCount: Number(row.bounced_count ?? 0),
      unsubscribedCount: Number(row.unsub_count ?? 0),
      conversionCount: Number(row.conversion_count ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(schema.crmCampaigns.id, campaignId))
}

/**
 * A/B winner decider — picks variant a or b based on the winner metric and
 * decides if both have collected enough samples (default: 100 sends per
 * variant minimum). Pauses the loser by marking ab_winning_variant.
 */
export async function decideAbWinner(
  ctx: Context,
  campaignId: string,
  opts: { minSamplesPerVariant?: number } = {},
): Promise<{ winner: 'a' | 'b' | null; reason: string }> {
  const minSamples = opts.minSamplesPerVariant ?? 100
  const campaignRows = await ctx.db
    .select()
    .from(schema.crmCampaigns)
    .where(eq(schema.crmCampaigns.id, campaignId))
    .limit(1)
  const campaign = campaignRows[0]
  if (!campaign?.abWinnerMetric) return { winner: null, reason: 'no_ab_config' }
  if (campaign.abWinningVariant)
    return { winner: campaign.abWinningVariant as 'a' | 'b', reason: 'already_decided' }

  const stats = await ctx.db.execute(sql`
    SELECT
      ab_variant,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opens,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicks,
      COUNT(*) FILTER (WHERE conversion_at IS NOT NULL) AS conversions
    FROM crm_message_log
    WHERE campaign_id = ${campaignId} AND ab_variant IN ('a','b')
    GROUP BY ab_variant
  `)
  const rows = stats as unknown as Array<{
    ab_variant: 'a' | 'b'
    sent: string
    opens: string
    clicks: string
    conversions: string
  }>
  const a = rows.find((r) => r.ab_variant === 'a')
  const b = rows.find((r) => r.ab_variant === 'b')
  if (!a || !b) return { winner: null, reason: 'missing_variant_data' }
  if (Number(a.sent) < minSamples || Number(b.sent) < minSamples) {
    return { winner: null, reason: 'insufficient_samples' }
  }

  const metricFor = (r: { sent: string; opens: string; clicks: string; conversions: string }) => {
    const sent = Number(r.sent)
    if (sent === 0) return 0
    if (campaign.abWinnerMetric === 'open_rate') return Number(r.opens) / sent
    if (campaign.abWinnerMetric === 'click_rate') return Number(r.clicks) / sent
    return Number(r.conversions) / sent
  }
  const winner: 'a' | 'b' = metricFor(a) >= metricFor(b) ? 'a' : 'b'

  await ctx.db
    .update(schema.crmCampaigns)
    .set({ abWinningVariant: winner, abDecidedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.crmCampaigns.id, campaignId))

  await writeAuditEntry(ctx.db, {
    actorKind: 'system',
    action: 'crm.campaign.ab_decided',
    resourceKind: 'crm_campaign',
    resourceId: campaignId,
    metadata: { winner, metric: campaign.abWinnerMetric },
  })

  return { winner, reason: 'decided' }
}

/**
 * Conversion attribution — finds player_events matching the campaign's
 * conversion event within the configured window after a campaign send,
 * and stamps crm_message_log.conversion_*.
 */
export async function attributeConversions(ctx: Context, campaignId: string): Promise<number> {
  const campaignRows = await ctx.db
    .select()
    .from(schema.crmCampaigns)
    .where(eq(schema.crmCampaigns.id, campaignId))
    .limit(1)
  const campaign = campaignRows[0]
  if (!campaign?.conversionEvent) return 0
  const windowHours = campaign.conversionWindowHours ?? 168

  const updated = await ctx.db.execute(sql`
    UPDATE crm_message_log m
    SET conversion_event_id = e.id, conversion_at = e.created_at
    FROM player_events e
    WHERE m.campaign_id = ${campaignId}
      AND m.conversion_at IS NULL
      AND m.player_id = e.player_id
      AND e.event_name = ${campaign.conversionEvent}
      AND e.created_at >= m.sent_at
      AND e.created_at <= m.sent_at + (${windowHours} || ' hours')::interval
    RETURNING m.id
  `)
  return Array.isArray(updated) ? updated.length : 0
}

export async function listCampaigns(
  ctx: Context,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: Array<typeof schema.crmCampaigns.$inferSelect>; total: number }> {
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  const baseQuery = ctx.db
    .select()
    .from(schema.crmCampaigns)
    .orderBy(desc(schema.crmCampaigns.createdAt))
    .limit(limit)
    .offset(offset)

  const rows = opts.status
    ? await baseQuery.where(eq(schema.crmCampaigns.status, opts.status))
    : await baseQuery

  const totalRows = await ctx.db.execute(sql`SELECT COUNT(*)::int AS n FROM crm_campaigns`)
  const total = (totalRows[0] as { n: number } | undefined)?.n ?? 0

  return { rows, total }
}

export async function getCampaign(
  ctx: Context,
  id: string,
): Promise<Result<typeof schema.crmCampaigns.$inferSelect, CampaignError>> {
  const rows = await ctx.db
    .select()
    .from(schema.crmCampaigns)
    .where(eq(schema.crmCampaigns.id, id))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(rows[0])
}

// ---- helpers --------------------------------------------------------------

async function getEmailRecipient(ctx: Context, playerId: string): Promise<string | null> {
  const rows = await ctx.db
    .select({ email: schema.players.email })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  return rows[0]?.email ?? null
}

async function getSmsRecipient(ctx: Context, playerId: string): Promise<string | null> {
  const rows = await ctx.db
    .select({ phone: schema.players.phone })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  return rows[0]?.phone ?? null
}
