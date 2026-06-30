// docs/11 §6 — template store + variable rendering.
//
// Both email and sms_templates are versioned by parent_id chain (each
// edit creates a new row with parent_id = previous current; the previous
// row's `is_current` flips false). The renderer evaluates {{ var }}
// expressions against a precomputed PlayerVariableContext per docs/11 §6.1.

import { differenceInCalendarDays, format } from 'date-fns'
import { and, desc, eq, sql } from 'drizzle-orm'
import Handlebars from 'handlebars'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// ---- Variable resolution --------------------------------------------------

export interface PlayerVariableContext {
  email: string
  username: string | null
  displayName: string | null
  tierName: string
  tierProgressPct: number
  balanceSc: string
  balanceGc: string
  lastLoginRelative: string
  signupDateFriendly: string
  firstName: string | null
  lastName: string | null
  state: string | null
}

export interface CampaignVariableContext {
  ctaUrl?: string
  promoCode?: string
}

export interface RenderContext {
  player: PlayerVariableContext
  campaign?: CampaignVariableContext
  unsubscribeUrl?: string
}

export async function buildPlayerVariableContext(
  ctx: Context,
  playerId: string,
): Promise<Result<PlayerVariableContext, { code: 'NOT_FOUND' }>> {
  const rows = await ctx.db.execute(sql`
    SELECT
      p.email,
      p.username,
      p.display_name AS "displayName",
      p.first_name AS "firstName",
      p.last_name AS "lastName",
      p.state,
      p.created_at AS "createdAt",
      p30.last_login_at AS "lastLoginAt",
      tp.current_tier_level AS "tierLevel",
      t.display_name AS "tierName",
      tp.current_xp AS "currentXp",
      tp.xp_for_next_tier AS "xpForNextTier",
      ws.current_balance AS "scBalance",
      wg.current_balance AS "gcBalance"
    FROM players p
    LEFT JOIN player_30d_stats p30 ON p30.player_id = p.id
    LEFT JOIN tier_progress tp ON tp.player_id = p.id
    LEFT JOIN tiers t ON t.id = tp.current_tier_id
    LEFT JOIN wallets ws ON ws.player_id = p.id AND ws.currency = 'SC'
    LEFT JOIN wallets wg ON wg.player_id = p.id AND wg.currency = 'GC'
    WHERE p.id = ${playerId}
    LIMIT 1
  `)

  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return err({ code: 'NOT_FOUND' as const })

  const tierProgressPct = computeTierProgressPct(row.currentXp, row.xpForNextTier)
  const lastLoginAt = row.lastLoginAt as Date | null
  const createdAt = row.createdAt as Date

  return ok({
    email: String(row.email ?? ''),
    username: (row.username as string | null) ?? null,
    displayName: (row.displayName as string | null) ?? null,
    firstName: (row.firstName as string | null) ?? null,
    lastName: (row.lastName as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    tierName: String(row.tierName ?? 'Bronze'),
    tierProgressPct,
    balanceSc: formatMoney(row.scBalance),
    balanceGc: formatMoney(row.gcBalance),
    lastLoginRelative: lastLoginAt ? friendlyRelative(lastLoginAt) : 'never',
    signupDateFriendly: format(createdAt, 'MMMM d, yyyy'),
  })
}

function formatMoney(raw: unknown): string {
  if (raw === null || raw === undefined) return '0.00'
  const n = typeof raw === 'string' ? Number(raw) : Number(raw)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

function computeTierProgressPct(current: unknown, target: unknown): number {
  const c = typeof current === 'string' ? Number(current) : Number(current)
  const t = typeof target === 'string' ? Number(target) : Number(target)
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return 0
  return Math.min(100, Math.round((c / t) * 100))
}

function friendlyRelative(date: Date): string {
  const days = differenceInCalendarDays(new Date(), date)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 30) return `${Math.round(days / 7)} weeks ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

// ---- Renderer -------------------------------------------------------------

const handlebars = Handlebars.create()
handlebars.registerHelper('upper', (v: unknown) => String(v ?? '').toUpperCase())
handlebars.registerHelper('lower', (v: unknown) => String(v ?? '').toLowerCase())
handlebars.registerHelper('default', (v: unknown, fallback: unknown) =>
  v === null || v === undefined || v === '' ? fallback : v,
)

export function renderTemplate(template: string, ctx: RenderContext): string {
  try {
    const compiled = handlebars.compile(template, { noEscape: false, strict: false })
    return compiled(ctx)
  } catch (e) {
    return template + `\n[render_error: ${e instanceof Error ? e.message : String(e)}]`
  }
}

export function renderPlaintextTemplate(template: string, ctx: RenderContext): string {
  try {
    const compiled = handlebars.compile(template, { noEscape: true, strict: false })
    return compiled(ctx)
  } catch (e) {
    return template + `\n[render_error: ${e instanceof Error ? e.message : String(e)}]`
  }
}

// ---- Template CRUD --------------------------------------------------------

export type TemplateError = { code: 'NOT_FOUND' } | { code: 'INVALID' } | { code: 'SLUG_CONFLICT' }

export interface SaveEmailTemplateInput {
  id?: string | null
  slug: string
  displayName: string
  subjectTemplate: string
  bodyHtmlTemplate: string
  bodyTextTemplate?: string | null
  fromEmail?: string | null
  replyTo?: string | null
  category?: string | null
}

export async function saveEmailTemplate(
  ctx: Context,
  input: SaveEmailTemplateInput,
): Promise<Result<{ id: string; version: number }, TemplateError>> {
  if (input.id) {
    // versioning: load current, mark not current, insert new with parent.
    const cur = await ctx.db
      .select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, input.id))
      .limit(1)
    if (!cur[0]) return err({ code: 'NOT_FOUND' as const })

    await ctx.db
      .update(schema.emailTemplates)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(eq(schema.emailTemplates.id, input.id))

    const inserted = await ctx.db
      .insert(schema.emailTemplates)
      .values({
        slug: cur[0].slug,
        displayName: input.displayName,
        version: (cur[0].version ?? 1) + 1,
        parentId: input.id,
        isCurrent: true,
        subjectTemplate: input.subjectTemplate,
        bodyHtmlTemplate: input.bodyHtmlTemplate,
        bodyTextTemplate: input.bodyTextTemplate ?? null,
        fromEmail: input.fromEmail ?? null,
        replyTo: input.replyTo ?? null,
        category: input.category ?? null,
        createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
      })
      .returning()

    await writeAuditEntry(ctx.db, {
      actorKind: 'admin',
      action: 'crm.email_template.update',
      resourceKind: 'email_template',
      resourceId: inserted[0]!.id,
      after: { slug: cur[0].slug, version: inserted[0]!.version },
    })

    return ok({ id: inserted[0]!.id, version: inserted[0]!.version })
  }

  // New slug.
  const inserted = await ctx.db
    .insert(schema.emailTemplates)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      version: 1,
      isCurrent: true,
      subjectTemplate: input.subjectTemplate,
      bodyHtmlTemplate: input.bodyHtmlTemplate,
      bodyTextTemplate: input.bodyTextTemplate ?? null,
      fromEmail: input.fromEmail ?? null,
      replyTo: input.replyTo ?? null,
      category: input.category ?? null,
      createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning()
    .catch((e) => {
      if (e instanceof Error && /unique/i.test(e.message)) return null
      throw e
    })

  if (!inserted || inserted.length === 0) return err({ code: 'SLUG_CONFLICT' as const })

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.email_template.create',
    resourceKind: 'email_template',
    resourceId: inserted[0]!.id,
    after: { slug: input.slug },
  })

  return ok({ id: inserted[0]!.id, version: 1 })
}

export interface SaveSmsTemplateInput {
  id?: string | null
  slug: string
  displayName: string
  bodyTemplate: string
  category?: string | null
}

export async function saveSmsTemplate(
  ctx: Context,
  input: SaveSmsTemplateInput,
): Promise<Result<{ id: string; version: number }, TemplateError>> {
  // SMS bodies must be <= 320 chars (DB-enforced; soft warn at 160).
  if (input.bodyTemplate.length > 320) return err({ code: 'INVALID' as const })

  if (input.id) {
    const cur = await ctx.db
      .select()
      .from(schema.smsTemplates)
      .where(eq(schema.smsTemplates.id, input.id))
      .limit(1)
    if (!cur[0]) return err({ code: 'NOT_FOUND' as const })

    await ctx.db
      .update(schema.smsTemplates)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(eq(schema.smsTemplates.id, input.id))

    const inserted = await ctx.db
      .insert(schema.smsTemplates)
      .values({
        slug: cur[0].slug,
        displayName: input.displayName,
        version: (cur[0].version ?? 1) + 1,
        parentId: input.id,
        isCurrent: true,
        bodyTemplate: input.bodyTemplate,
        category: input.category ?? null,
        createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
      })
      .returning()

    await writeAuditEntry(ctx.db, {
      actorKind: 'admin',
      action: 'crm.sms_template.update',
      resourceKind: 'sms_template',
      resourceId: inserted[0]!.id,
      after: { slug: cur[0].slug, version: inserted[0]!.version },
    })

    return ok({ id: inserted[0]!.id, version: inserted[0]!.version })
  }

  const inserted = await ctx.db
    .insert(schema.smsTemplates)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      version: 1,
      isCurrent: true,
      bodyTemplate: input.bodyTemplate,
      category: input.category ?? null,
      createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning()
    .catch((e) => {
      if (e instanceof Error && /unique/i.test(e.message)) return null
      throw e
    })

  if (!inserted || inserted.length === 0) return err({ code: 'SLUG_CONFLICT' as const })

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.sms_template.create',
    resourceKind: 'sms_template',
    resourceId: inserted[0]!.id,
    after: { slug: input.slug },
  })

  return ok({ id: inserted[0]!.id, version: 1 })
}

export async function listEmailTemplates(ctx: Context): Promise<
  Array<{
    id: string
    slug: string
    displayName: string
    version: number
    category: string | null
    updatedAt: Date
  }>
> {
  const rows = await ctx.db
    .select({
      id: schema.emailTemplates.id,
      slug: schema.emailTemplates.slug,
      displayName: schema.emailTemplates.displayName,
      version: schema.emailTemplates.version,
      category: schema.emailTemplates.category,
      updatedAt: schema.emailTemplates.updatedAt,
    })
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.isCurrent, true))
    .orderBy(desc(schema.emailTemplates.updatedAt))
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    version: r.version,
    category: r.category,
    updatedAt: r.updatedAt,
  }))
}

export async function listSmsTemplates(ctx: Context): Promise<
  Array<{
    id: string
    slug: string
    displayName: string
    version: number
    category: string | null
    updatedAt: Date
    bodyLength: number
  }>
> {
  const rows = await ctx.db
    .select()
    .from(schema.smsTemplates)
    .where(eq(schema.smsTemplates.isCurrent, true))
    .orderBy(desc(schema.smsTemplates.updatedAt))
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    version: r.version,
    category: r.category,
    updatedAt: r.updatedAt,
    bodyLength: r.bodyTemplate.length,
  }))
}

export async function getEmailTemplate(
  ctx: Context,
  id: string,
): Promise<Result<typeof schema.emailTemplates.$inferSelect, TemplateError>> {
  const rows = await ctx.db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, id))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(rows[0])
}

export async function getEmailTemplateBySlug(
  ctx: Context,
  slug: string,
): Promise<Result<typeof schema.emailTemplates.$inferSelect, TemplateError>> {
  const rows = await ctx.db
    .select()
    .from(schema.emailTemplates)
    .where(and(eq(schema.emailTemplates.slug, slug), eq(schema.emailTemplates.isCurrent, true)))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(rows[0])
}

export async function getSmsTemplate(
  ctx: Context,
  id: string,
): Promise<Result<typeof schema.smsTemplates.$inferSelect, TemplateError>> {
  const rows = await ctx.db
    .select()
    .from(schema.smsTemplates)
    .where(eq(schema.smsTemplates.id, id))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(rows[0])
}

export async function getSmsTemplateBySlug(
  ctx: Context,
  slug: string,
): Promise<Result<typeof schema.smsTemplates.$inferSelect, TemplateError>> {
  const rows = await ctx.db
    .select()
    .from(schema.smsTemplates)
    .where(and(eq(schema.smsTemplates.slug, slug), eq(schema.smsTemplates.isCurrent, true)))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(rows[0])
}
