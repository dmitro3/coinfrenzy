// docs/11 §5 — flow engine.
//
// Flows are state machines stored as `crm_flows` (the metadata) +
// `crm_flow_steps` (ordered list of actions) + `crm_flow_enrollments`
// (one row per (flow, player) journey). The runner runs every minute
// and processes any enrollment with `next_action_at <= NOW()`.

import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import { award as awardBonus } from '../bonus/engine'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { sendOneCampaignMessage } from './campaigns'
import { canReceive } from './eligibility'
import { dispatchEmail, dispatchSms } from './dispatchers'
import { compile } from './compiler'
import { validateFilterTree, type FilterTree } from './filter-tree'
import {
  buildPlayerVariableContext,
  getEmailTemplate,
  getEmailTemplateBySlug,
  getSmsTemplate,
  getSmsTemplateBySlug,
  renderTemplate,
  renderPlaintextTemplate,
} from './templates'

export type FlowStepActionType =
  | 'send_email'
  | 'send_sms'
  | 'wait'
  | 'condition'
  | 'award_bonus'
  | 'add_to_segment'
  | 'remove_from_segment'
  | 'end'

export interface FlowStepConfig {
  // send_email / send_sms
  templateId?: string
  templateSlug?: string
  // wait
  waitSeconds?: number
  // condition
  conditionTree?: FilterTree | unknown
  thenStep?: number
  elseStep?: number
  // award_bonus
  bonusId?: string
  bonusSlug?: string
  // segment ops
  segmentId?: string
}

export interface SaveFlowInput {
  id?: string | null
  name: string
  description?: string | null
  triggerEvent: string
  triggerFilter?: FilterTree | unknown | null
  maxEnrollmentsPerPlayer?: number | null
  cooldownHoursBetweenEnrollments?: number | null
  status?: 'active' | 'paused' | 'archived'
  conversionEvent?: string | null
  steps: Array<{
    stepNumber: number
    actionType: FlowStepActionType
    config: FlowStepConfig
    waitDurationSeconds?: number | null
  }>
}

export type FlowError = { code: 'NOT_FOUND' } | { code: 'INVALID' }

export async function saveFlow(
  ctx: Context,
  input: SaveFlowInput,
): Promise<Result<{ id: string }, FlowError>> {
  if (input.steps.length === 0) return err({ code: 'INVALID' as const })
  // validate triggerFilter shape if present
  if (input.triggerFilter) {
    try {
      validateFilterTree(input.triggerFilter)
    } catch {
      return err({ code: 'INVALID' as const })
    }
  }

  if (input.id) {
    const existing = await ctx.db
      .select()
      .from(schema.crmFlows)
      .where(eq(schema.crmFlows.id, input.id))
      .limit(1)
    if (!existing[0]) return err({ code: 'NOT_FOUND' as const })

    await ctx.db
      .update(schema.crmFlows)
      .set({
        name: input.name,
        description: input.description ?? null,
        triggerEvent: input.triggerEvent,
        triggerFilter: input.triggerFilter ?? null,
        maxEnrollmentsPerPlayer: input.maxEnrollmentsPerPlayer ?? 1,
        cooldownHoursBetweenEnrollments: input.cooldownHoursBetweenEnrollments ?? null,
        status: input.status ?? existing[0].status,
        conversionEvent: input.conversionEvent ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.crmFlows.id, input.id))

    // Replace steps wholesale.
    await ctx.db.delete(schema.crmFlowSteps).where(eq(schema.crmFlowSteps.flowId, input.id))
    if (input.steps.length > 0) {
      await ctx.db.insert(schema.crmFlowSteps).values(
        input.steps.map((s) => ({
          flowId: input.id!,
          stepNumber: s.stepNumber,
          actionType: s.actionType,
          config: s.config as Record<string, unknown>,
          waitDurationSeconds: s.waitDurationSeconds ?? s.config.waitSeconds ?? null,
        })),
      )
    }

    await writeAuditEntry(ctx.db, {
      actorKind: 'admin',
      action: 'crm.flow.update',
      resourceKind: 'crm_flow',
      resourceId: input.id,
    })

    return ok({ id: input.id })
  }

  const inserted = await ctx.db
    .insert(schema.crmFlows)
    .values({
      name: input.name,
      description: input.description ?? null,
      triggerEvent: input.triggerEvent,
      triggerFilter: input.triggerFilter ?? null,
      maxEnrollmentsPerPlayer: input.maxEnrollmentsPerPlayer ?? 1,
      cooldownHoursBetweenEnrollments: input.cooldownHoursBetweenEnrollments ?? null,
      status: input.status ?? 'active',
      conversionEvent: input.conversionEvent ?? null,
      createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning({ id: schema.crmFlows.id })

  const newId = inserted[0]!.id
  await ctx.db.insert(schema.crmFlowSteps).values(
    input.steps.map((s) => ({
      flowId: newId,
      stepNumber: s.stepNumber,
      actionType: s.actionType,
      config: s.config as Record<string, unknown>,
      waitDurationSeconds: s.waitDurationSeconds ?? s.config.waitSeconds ?? null,
    })),
  )

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.flow.create',
    resourceKind: 'crm_flow',
    resourceId: newId,
    after: { name: input.name, triggerEvent: input.triggerEvent },
  })

  return ok({ id: newId })
}

export async function pauseFlow(ctx: Context, flowId: string): Promise<Result<void, FlowError>> {
  const updated = await ctx.db
    .update(schema.crmFlows)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(schema.crmFlows.id, flowId))
    .returning({ id: schema.crmFlows.id })
  if (!updated[0]) return err({ code: 'NOT_FOUND' as const })
  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.flow.pause',
    resourceKind: 'crm_flow',
    resourceId: flowId,
  })
  return ok(undefined)
}

export async function resumeFlow(ctx: Context, flowId: string): Promise<Result<void, FlowError>> {
  const updated = await ctx.db
    .update(schema.crmFlows)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(schema.crmFlows.id, flowId))
    .returning({ id: schema.crmFlows.id })
  if (!updated[0]) return err({ code: 'NOT_FOUND' as const })
  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.flow.resume',
    resourceKind: 'crm_flow',
    resourceId: flowId,
  })
  return ok(undefined)
}

/**
 * Enroll a player. Called by the trigger event consumer in the worker.
 * Honors max-enrollments-per-player + cooldown.
 */
export async function enrollPlayer(
  ctx: Context,
  args: { flowId: string; playerId: string },
): Promise<Result<{ enrollmentId: string }, FlowError>> {
  const flowRows = await ctx.db
    .select()
    .from(schema.crmFlows)
    .where(eq(schema.crmFlows.id, args.flowId))
    .limit(1)
  const flow = flowRows[0]
  if (!flow) return err({ code: 'NOT_FOUND' as const })
  if (flow.status !== 'active') return err({ code: 'INVALID' as const })

  const max = flow.maxEnrollmentsPerPlayer ?? 1
  const cooldownHours = flow.cooldownHoursBetweenEnrollments ?? null

  const existing = await ctx.db
    .select({
      id: schema.crmFlowEnrollments.id,
      enrolledAt: schema.crmFlowEnrollments.enrolledAt,
    })
    .from(schema.crmFlowEnrollments)
    .where(
      and(
        eq(schema.crmFlowEnrollments.flowId, args.flowId),
        eq(schema.crmFlowEnrollments.playerId, args.playerId),
      ),
    )
    .orderBy(desc(schema.crmFlowEnrollments.enrolledAt))
  if (existing.length >= max) return err({ code: 'INVALID' as const })
  if (cooldownHours && existing[0]) {
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000)
    if (existing[0].enrolledAt > cutoff) return err({ code: 'INVALID' as const })
  }

  // Apply trigger filter (if set) before enrolling.
  if (flow.triggerFilter) {
    const compiled = compile(flow.triggerFilter, { mode: 'count' })
    const matches = await ctx.db.execute(
      sql.raw(
        `SELECT 1 FROM (${compiled.sql.replace('COUNT(DISTINCT p.id) AS total', 'p.id')}) sub WHERE sub.id = '${args.playerId}' LIMIT 1`,
      ),
    )
    if ((matches as unknown as unknown[]).length === 0) return err({ code: 'INVALID' as const })
  }

  const inserted = await ctx.db
    .insert(schema.crmFlowEnrollments)
    .values({
      flowId: args.flowId,
      playerId: args.playerId,
      currentStep: 1,
      nextActionAt: new Date(),
      status: 'active',
    })
    .returning({ id: schema.crmFlowEnrollments.id })

  await ctx.db
    .update(schema.crmFlows)
    .set({
      enrollmentsCountLifetime: sql`${schema.crmFlows.enrollmentsCountLifetime} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.crmFlows.id, args.flowId))

  return ok({ enrollmentId: inserted[0]!.id })
}

/**
 * Process every active enrollment that's due. Runs every minute via Inngest
 * cron. Each enrollment processed independently — one failure doesn't
 * cascade.
 */
export async function processDueEnrollments(
  ctx: Context,
  opts: { batchSize?: number } = {},
): Promise<{ processed: number; errored: number }> {
  const limit = opts.batchSize ?? 500
  const due = await ctx.db
    .select()
    .from(schema.crmFlowEnrollments)
    .where(
      and(
        eq(schema.crmFlowEnrollments.status, 'active'),
        lte(schema.crmFlowEnrollments.nextActionAt, new Date()),
      ),
    )
    .orderBy(asc(schema.crmFlowEnrollments.nextActionAt))
    .limit(limit)

  let processed = 0
  let errored = 0
  for (const enrollment of due) {
    try {
      await processFlowStep(ctx, enrollment)
      processed += 1
    } catch (e) {
      errored += 1
      ctx.logger.error('flow_step_failed', {
        enrollmentId: enrollment.id,
        error: e instanceof Error ? e.message : String(e),
      })
      await ctx.db
        .update(schema.crmFlowEnrollments)
        .set({
          status: 'errored',
          errorMessage: e instanceof Error ? e.message : String(e),
        })
        .where(eq(schema.crmFlowEnrollments.id, enrollment.id))
    }
  }
  return { processed, errored }
}

async function processFlowStep(
  ctx: Context,
  enrollment: typeof schema.crmFlowEnrollments.$inferSelect,
): Promise<void> {
  const stepRows = await ctx.db
    .select()
    .from(schema.crmFlowSteps)
    .where(
      and(
        eq(schema.crmFlowSteps.flowId, enrollment.flowId),
        eq(schema.crmFlowSteps.stepNumber, enrollment.currentStep),
      ),
    )
    .limit(1)
  const step = stepRows[0]

  if (!step) {
    // No more steps — mark complete.
    await completeEnrollment(ctx, enrollment.id)
    return
  }

  const config = (step.config ?? {}) as FlowStepConfig
  switch (step.actionType as FlowStepActionType) {
    case 'send_email':
    case 'send_sms':
      await sendStepMessage(ctx, enrollment, step.actionType as 'send_email' | 'send_sms', config)
      await advance(ctx, enrollment)
      break
    case 'wait': {
      const waitSeconds = step.waitDurationSeconds ?? config.waitSeconds ?? 60
      await ctx.db
        .update(schema.crmFlowEnrollments)
        .set({
          currentStep: enrollment.currentStep + 1,
          nextActionAt: new Date(Date.now() + waitSeconds * 1000),
          lastStepAt: new Date(),
        })
        .where(eq(schema.crmFlowEnrollments.id, enrollment.id))
      break
    }
    case 'condition': {
      const tree = config.conditionTree
      let matches = false
      if (tree) {
        const compiled = compile(tree, { mode: 'count' })
        const result = await ctx.db.execute(
          sql.raw(
            `SELECT 1 FROM (${compiled.sql.replace('COUNT(DISTINCT p.id) AS total', 'p.id')}) sub WHERE sub.id = '${enrollment.playerId}' LIMIT 1`,
          ),
        )
        matches = (result as unknown as unknown[]).length > 0
      }
      const next = matches
        ? (config.thenStep ?? enrollment.currentStep + 1)
        : (config.elseStep ?? enrollment.currentStep + 1)
      await ctx.db
        .update(schema.crmFlowEnrollments)
        .set({
          currentStep: next,
          nextActionAt: new Date(),
          lastStepAt: new Date(),
        })
        .where(eq(schema.crmFlowEnrollments.id, enrollment.id))
      break
    }
    case 'award_bonus': {
      // Resolve bonus by id or slug.
      let bonusId = config.bonusId
      if (!bonusId && config.bonusSlug) {
        const rows = await ctx.db
          .select({ id: schema.bonuses.id })
          .from(schema.bonuses)
          .where(eq(schema.bonuses.slug, config.bonusSlug))
          .limit(1)
        bonusId = rows[0]?.id
      }
      if (!bonusId) {
        ctx.logger.warn('flow_award_bonus_missing', {
          enrollmentId: enrollment.id,
          stepNumber: step.stepNumber,
        })
      } else {
        const result = await awardBonus(ctx, {
          playerId: enrollment.playerId,
          bonusId,
          sourceKind: 'crm_flow',
          sourceId: `${enrollment.id}:${step.stepNumber}`,
          reason: `crm flow step ${step.stepNumber}`,
        })
        if (!result.ok) {
          ctx.logger.info('flow_award_bonus_skipped', {
            enrollmentId: enrollment.id,
            code: result.error.code,
          })
        }
      }
      await advance(ctx, enrollment)
      break
    }
    case 'add_to_segment': {
      // Static-membership segments aren't a first-class concept in our
      // schema (segments are saved queries). We simulate "add to segment"
      // by writing a special event so future segment queries can pick it
      // up. No-op silently for now.
      ctx.logger.info('flow_add_to_segment_noop', {
        enrollmentId: enrollment.id,
        segmentId: config.segmentId,
      })
      await advance(ctx, enrollment)
      break
    }
    case 'remove_from_segment': {
      ctx.logger.info('flow_remove_from_segment_noop', {
        enrollmentId: enrollment.id,
        segmentId: config.segmentId,
      })
      await advance(ctx, enrollment)
      break
    }
    case 'end':
      await completeEnrollment(ctx, enrollment.id)
      break
  }
}

async function advance(
  ctx: Context,
  enrollment: typeof schema.crmFlowEnrollments.$inferSelect,
): Promise<void> {
  // Look ahead for the next step; if none exists, complete the enrollment.
  const next = await ctx.db
    .select({ stepNumber: schema.crmFlowSteps.stepNumber })
    .from(schema.crmFlowSteps)
    .where(
      and(
        eq(schema.crmFlowSteps.flowId, enrollment.flowId),
        sql`${schema.crmFlowSteps.stepNumber} > ${enrollment.currentStep}`,
      ),
    )
    .orderBy(asc(schema.crmFlowSteps.stepNumber))
    .limit(1)
  if (!next[0]) {
    await completeEnrollment(ctx, enrollment.id)
    return
  }
  await ctx.db
    .update(schema.crmFlowEnrollments)
    .set({
      currentStep: next[0].stepNumber,
      nextActionAt: new Date(),
      lastStepAt: new Date(),
    })
    .where(eq(schema.crmFlowEnrollments.id, enrollment.id))
}

async function completeEnrollment(ctx: Context, enrollmentId: string): Promise<void> {
  await ctx.db
    .update(schema.crmFlowEnrollments)
    .set({
      status: 'completed',
      completedAt: new Date(),
      lastStepAt: new Date(),
    })
    .where(eq(schema.crmFlowEnrollments.id, enrollmentId))
}

async function sendStepMessage(
  ctx: Context,
  enrollment: typeof schema.crmFlowEnrollments.$inferSelect,
  channel: 'send_email' | 'send_sms',
  config: FlowStepConfig,
): Promise<void> {
  const playerCtx = await buildPlayerVariableContext(ctx, enrollment.playerId)
  if (!playerCtx.ok) return

  // Resolve template id (preferring slug if both supplied).
  let templateId = config.templateId
  if (!templateId && config.templateSlug) {
    if (channel === 'send_email') {
      const r = await getEmailTemplateBySlug(ctx, config.templateSlug)
      if (r.ok) templateId = r.value.id
    } else {
      const r = await getSmsTemplateBySlug(ctx, config.templateSlug)
      if (r.ok) templateId = r.value.id
    }
  }
  if (!templateId) {
    ctx.logger.warn('flow_send_no_template', {
      enrollmentId: enrollment.id,
      channel,
    })
    return
  }

  const eligibility = await canReceive(ctx, {
    playerId: enrollment.playerId,
    channel: channel === 'send_email' ? 'email' : 'sms',
  })
  if (!eligibility.eligible) {
    await ctx.db.insert(schema.crmMessageLog).values({
      playerId: enrollment.playerId,
      flowEnrollmentId: enrollment.id,
      templateId,
      channel: channel === 'send_email' ? 'email' : 'sms',
      recipient: enrollment.playerId,
      status: 'failed',
      errorCode: eligibility.reason ?? 'ineligible',
      queuedAt: new Date(),
    })
    return
  }

  if (channel === 'send_email') {
    const tplResult = await getEmailTemplate(ctx, templateId)
    if (!tplResult.ok) return
    const tpl = tplResult.value
    const subject = renderTemplate(tpl.subjectTemplate, { player: playerCtx.value })
    const html = renderTemplate(tpl.bodyHtmlTemplate, { player: playerCtx.value })
    const text = tpl.bodyTextTemplate
      ? renderPlaintextTemplate(tpl.bodyTextTemplate, { player: playerCtx.value })
      : null
    const recipient = await getPlayerEmail(ctx, enrollment.playerId)
    if (!recipient) return

    const inserted = await ctx.db
      .insert(schema.crmMessageLog)
      .values({
        playerId: enrollment.playerId,
        flowEnrollmentId: enrollment.id,
        templateId,
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
    return
  }

  // SMS
  const tplResult = await getSmsTemplate(ctx, templateId)
  if (!tplResult.ok) return
  const tpl = tplResult.value
  const body = renderPlaintextTemplate(tpl.bodyTemplate, { player: playerCtx.value })
  const recipient = await getPlayerPhone(ctx, enrollment.playerId)
  if (!recipient) return

  const inserted = await ctx.db
    .insert(schema.crmMessageLog)
    .values({
      playerId: enrollment.playerId,
      flowEnrollmentId: enrollment.id,
      templateId,
      channel: 'sms',
      recipient,
      bodyPreview: body.slice(0, 200),
      status: 'queued',
      queuedAt: new Date(),
    })
    .returning({ id: schema.crmMessageLog.id })
  const logId = inserted[0]!.id

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
}

async function getPlayerEmail(ctx: Context, playerId: string): Promise<string | null> {
  const rows = await ctx.db
    .select({ email: schema.players.email })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  return rows[0]?.email ?? null
}

async function getPlayerPhone(ctx: Context, playerId: string): Promise<string | null> {
  const rows = await ctx.db
    .select({ phone: schema.players.phone })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  return rows[0]?.phone ?? null
}

export async function listFlows(
  ctx: Context,
  opts: { status?: string } = {},
): Promise<Array<typeof schema.crmFlows.$inferSelect>> {
  const baseQuery = ctx.db.select().from(schema.crmFlows).orderBy(desc(schema.crmFlows.updatedAt))

  if (opts.status) {
    return await baseQuery.where(eq(schema.crmFlows.status, opts.status))
  }
  return await baseQuery
}

export async function getFlow(
  ctx: Context,
  id: string,
): Promise<
  Result<
    {
      flow: typeof schema.crmFlows.$inferSelect
      steps: Array<typeof schema.crmFlowSteps.$inferSelect>
    },
    FlowError
  >
> {
  const flowRows = await ctx.db
    .select()
    .from(schema.crmFlows)
    .where(eq(schema.crmFlows.id, id))
    .limit(1)
  if (!flowRows[0]) return err({ code: 'NOT_FOUND' as const })
  const stepRows = await ctx.db
    .select()
    .from(schema.crmFlowSteps)
    .where(eq(schema.crmFlowSteps.flowId, id))
    .orderBy(asc(schema.crmFlowSteps.stepNumber))
  return ok({ flow: flowRows[0], steps: stepRows })
}

export async function flowAnalytics(
  ctx: Context,
  flowId: string,
): Promise<{
  enrollmentsAllTime: number
  enrollments7d: number
  active: number
  completed: number
  errored: number
  perStep: Array<{ stepNumber: number; count: number }>
}> {
  const counts = await ctx.db.execute(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE enrolled_at >= NOW() - INTERVAL '7 days') AS recent,
      COUNT(*) FILTER (WHERE status = 'active') AS active,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'errored') AS errored
    FROM crm_flow_enrollments
    WHERE flow_id = ${flowId}
  `)
  const main = (counts as unknown as Array<Record<string, string>>)[0] ?? {}
  const perStep = await ctx.db.execute(sql`
    SELECT current_step AS step_number, COUNT(*)::int AS count
    FROM crm_flow_enrollments
    WHERE flow_id = ${flowId} AND status = 'active'
    GROUP BY current_step
    ORDER BY current_step
  `)
  return {
    enrollmentsAllTime: Number(main.total ?? 0),
    enrollments7d: Number(main.recent ?? 0),
    active: Number(main.active ?? 0),
    completed: Number(main.completed ?? 0),
    errored: Number(main.errored ?? 0),
    perStep: (perStep as unknown as Array<{ step_number: number; count: number }>).map((r) => ({
      stepNumber: r.step_number,
      count: r.count,
    })),
  }
}

/**
 * Recovery scan: pulls player_events newer than `since` whose name matches
 * an active flow's trigger event and whose player isn't already enrolled.
 * The worker calls this every minute as belt-and-braces over Inngest.
 */
export async function recoveryEnrollScan(ctx: Context, since: Date): Promise<{ enrolled: number }> {
  const flows = await ctx.db
    .select({ id: schema.crmFlows.id, triggerEvent: schema.crmFlows.triggerEvent })
    .from(schema.crmFlows)
    .where(eq(schema.crmFlows.status, 'active'))

  let enrolled = 0
  for (const flow of flows) {
    // Find players who fired the trigger event since `since` and aren't enrolled.
    const candidates = await ctx.db.execute(sql`
      SELECT DISTINCT pe.player_id
      FROM player_events pe
      WHERE pe.event_name = ${flow.triggerEvent}
        AND pe.created_at >= ${since.toISOString()}
        AND NOT EXISTS (
          SELECT 1 FROM crm_flow_enrollments e
          WHERE e.flow_id = ${flow.id} AND e.player_id = pe.player_id
        )
      LIMIT 5000
    `)
    for (const row of candidates as unknown as Array<{ player_id: string }>) {
      const result = await enrollPlayer(ctx, { flowId: flow.id, playerId: row.player_id })
      if (result.ok) enrolled += 1
    }
  }
  return { enrolled }
}

/** Reference to the campaign sender so flows can also dispatch via campaigns. */
export { sendOneCampaignMessage }

/** Listing helper for unenrolled players seeing the trigger fire (used by tests). */
export async function findActiveEnrollments(
  ctx: Context,
  playerId: string,
): Promise<Array<typeof schema.crmFlowEnrollments.$inferSelect>> {
  return await ctx.db
    .select()
    .from(schema.crmFlowEnrollments)
    .where(
      and(
        eq(schema.crmFlowEnrollments.playerId, playerId),
        eq(schema.crmFlowEnrollments.status, 'active'),
      ),
    )
}

/** Mark enrollments as cancelled (used by admin "stop journey" action). */
export async function cancelEnrollment(
  ctx: Context,
  enrollmentId: string,
): Promise<Result<void, FlowError>> {
  const updated = await ctx.db
    .update(schema.crmFlowEnrollments)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(
      and(
        eq(schema.crmFlowEnrollments.id, enrollmentId),
        eq(schema.crmFlowEnrollments.status, 'active'),
      ),
    )
    .returning({ id: schema.crmFlowEnrollments.id })
  if (!updated[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(undefined)
}

void isNull // keep import — used by enrollment lookups in pgEval previously.
