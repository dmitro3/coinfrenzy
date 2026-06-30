// docs/03 §11 — site_content (page CMS).
//
// "Pages" are the operator's static-content surface: Terms, Privacy,
// Cookie Policy, Sweepstakes Rules, Responsible Gaming, Bonus Terms,
// Jackpot details — anything you'd find in the footer of a casino site.
// Marketing banners are a separate concept stored in the dedicated
// `banners` table; this module deliberately does NOT touch them.
//
// We use the existing `site_content` table (key/value/value_json) and
// discriminate page rows via `value_json.kind = 'page'`. No schema
// change required.
//
// Body content is stored as plain text with a tiny in-house markdown
// dialect (sections delimited by `## Heading`, paragraphs separated by
// blank lines). See `parsePageBody` for the spec. We deliberately do
// NOT use `dangerouslySetInnerHTML` — every fragment is rendered
// through React directly.

import { and, asc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// Re-export parser pieces from the browser-safe module so callers can
// pull them via `cms.parsePageBody` etc. without bundling Drizzle.
export {
  parsePageBody,
  slugify,
  type ParsedPage,
  type ParsedSection,
  type ParsedBlock,
} from './markdown'

export type PageStatus = 'active' | 'draft' | 'archived'

export interface PageRow {
  id: string
  slug: string
  title: string
  category: string | null
  status: PageStatus
  audience: string | null
  body: string
  seoDescription: string | null
  version: number
  updatedAt: Date
  createdAt: Date
}

export interface PageJson {
  kind: 'page'
  title: string
  category: string | null
  status: PageStatus
  seoDescription: string | null
}

export interface PageListItem {
  id: string
  slug: string
  title: string
  category: string | null
  status: PageStatus
  audience: string | null
  bodyExcerpt: string
  version: number
  updatedAt: Date
}

export interface ListFilters {
  search?: string
  status?: PageStatus | 'all'
  category?: string | 'all'
  limit?: number
}

export type PageError =
  | { code: 'NOT_FOUND' }
  | { code: 'SLUG_CONFLICT' }
  | { code: 'INVALID'; reason: string }

export interface CreatePageInput {
  slug: string
  title: string
  body: string
  category?: string | null
  status?: PageStatus
  audience?: string | null
  seoDescription?: string | null
}

export interface UpdatePageInput extends Partial<CreatePageInput> {
  id: string
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

function validateInput(input: Partial<CreatePageInput>): Result<void, PageError> {
  if (input.slug !== undefined && !SLUG_RE.test(input.slug)) {
    return err({ code: 'INVALID' as const, reason: 'slug_must_be_lowercase_alnum_hyphens' })
  }
  if (input.title !== undefined && input.title.trim().length === 0) {
    return err({ code: 'INVALID' as const, reason: 'title_required' })
  }
  if (input.body !== undefined && input.body.length > 200_000) {
    return err({ code: 'INVALID' as const, reason: 'body_too_long' })
  }
  if (input.seoDescription !== undefined && input.seoDescription !== null) {
    if (input.seoDescription.length > 300) {
      return err({ code: 'INVALID' as const, reason: 'seo_description_too_long' })
    }
  }
  return ok(undefined)
}

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

const KIND_PATH = sql<string>`${schema.siteContent.valueJson}->>'kind'`
const TITLE_PATH = sql<string>`${schema.siteContent.valueJson}->>'title'`
const STATUS_PATH = sql<string>`coalesce(${schema.siteContent.valueJson}->>'status', 'active')`
const CATEGORY_PATH = sql<string>`${schema.siteContent.valueJson}->>'category'`

const PAGE_FILTER = eq(KIND_PATH, 'page')

export async function listPages(ctx: Context, filters: ListFilters = {}): Promise<PageListItem[]> {
  const limit = filters.limit ?? 200
  const conds = [PAGE_FILTER]
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`
    conds.push(or(ilike(TITLE_PATH, q), ilike(schema.siteContent.key, q))!)
  }
  if (filters.status && filters.status !== 'all') {
    conds.push(eq(STATUS_PATH, filters.status))
  }
  if (filters.category && filters.category !== 'all') {
    conds.push(eq(CATEGORY_PATH, filters.category))
  }

  const rows = await ctx.db
    .select({
      id: schema.siteContent.id,
      key: schema.siteContent.key,
      value: schema.siteContent.value,
      valueJson: schema.siteContent.valueJson,
      audience: schema.siteContent.audience,
      version: schema.siteContent.version,
      updatedAt: schema.siteContent.updatedAt,
    })
    .from(schema.siteContent)
    .where(and(...conds))
    .orderBy(asc(TITLE_PATH))
    .limit(limit)

  return rows.map((r) => {
    const meta = (r.valueJson ?? {}) as Partial<PageJson>
    const body = r.value ?? ''
    return {
      id: r.id,
      slug: r.key,
      title: meta.title ?? r.key,
      category: meta.category ?? null,
      status: (meta.status as PageStatus | undefined) ?? 'active',
      audience: r.audience,
      bodyExcerpt: body
        .replace(/##\s+.*\n/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 160),
      version: r.version,
      updatedAt: r.updatedAt,
    }
  })
}

export async function getPage(ctx: Context, id: string): Promise<Result<PageRow, PageError>> {
  const rows = await ctx.db
    .select()
    .from(schema.siteContent)
    .where(and(eq(schema.siteContent.id, id), PAGE_FILTER))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(toPageRow(rows[0]))
}

export async function getPageBySlug(
  ctx: Context,
  slug: string,
): Promise<Result<PageRow, PageError>> {
  const rows = await ctx.db
    .select()
    .from(schema.siteContent)
    .where(and(eq(schema.siteContent.key, slug), PAGE_FILTER))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(toPageRow(rows[0]))
}

export async function listCategories(ctx: Context): Promise<string[]> {
  const rows = await ctx.db
    .select({ category: CATEGORY_PATH })
    .from(schema.siteContent)
    .where(and(PAGE_FILTER, isNotNull(CATEGORY_PATH)))
    .groupBy(CATEGORY_PATH)
    .orderBy(asc(CATEGORY_PATH))
  return rows.map((r) => r.category).filter((c): c is string => typeof c === 'string')
}

// -------------------------------------------------------------------------
// Writes
// -------------------------------------------------------------------------

export async function createPage(
  ctx: Context,
  input: CreatePageInput,
): Promise<Result<{ id: string }, PageError>> {
  const v = validateInput(input)
  if (!v.ok) return v

  const slugRow = await ctx.db
    .select({ id: schema.siteContent.id })
    .from(schema.siteContent)
    .where(eq(schema.siteContent.key, input.slug))
    .limit(1)
  if (slugRow[0]) return err({ code: 'SLUG_CONFLICT' as const })

  const json: PageJson = {
    kind: 'page',
    title: input.title.trim(),
    category: input.category ?? null,
    status: input.status ?? 'active',
    seoDescription: input.seoDescription ?? null,
  }

  const inserted = await ctx.db
    .insert(schema.siteContent)
    .values({
      key: input.slug,
      value: input.body ?? '',
      valueJson: json,
      version: 1,
      audience: input.audience ?? null,
      updatedBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning({ id: schema.siteContent.id })

  const id = inserted[0]!.id

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'cms.page.create',
    resourceKind: 'cms_page',
    resourceId: id,
    after: { slug: input.slug, ...json, audience: input.audience ?? null },
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok({ id })
}

export async function updatePage(
  ctx: Context,
  input: UpdatePageInput,
): Promise<Result<void, PageError>> {
  const v = validateInput(input)
  if (!v.ok) return v

  const existingRows = await ctx.db
    .select()
    .from(schema.siteContent)
    .where(and(eq(schema.siteContent.id, input.id), PAGE_FILTER))
    .limit(1)
  if (!existingRows[0]) return err({ code: 'NOT_FOUND' as const })
  const existing = existingRows[0]
  const meta = (existing.valueJson ?? {}) as Partial<PageJson>

  if (input.slug && input.slug !== existing.key) {
    const slugRow = await ctx.db
      .select({ id: schema.siteContent.id })
      .from(schema.siteContent)
      .where(eq(schema.siteContent.key, input.slug))
      .limit(1)
    if (slugRow[0]) return err({ code: 'SLUG_CONFLICT' as const })
  }

  const nextJson: PageJson = {
    kind: 'page',
    title: input.title?.trim() ?? meta.title ?? '',
    category: input.category !== undefined ? input.category : (meta.category ?? null),
    status: input.status ?? (meta.status as PageStatus | undefined) ?? 'active',
    seoDescription:
      input.seoDescription !== undefined ? input.seoDescription : (meta.seoDescription ?? null),
  }

  await ctx.db
    .update(schema.siteContent)
    .set({
      key: input.slug ?? existing.key,
      value: input.body !== undefined ? input.body : existing.value,
      valueJson: nextJson,
      version: existing.version + 1,
      audience: input.audience !== undefined ? input.audience : existing.audience,
      updatedBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : existing.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(schema.siteContent.id, input.id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'cms.page.update',
    resourceKind: 'cms_page',
    resourceId: input.id,
    before: {
      slug: existing.key,
      ...(meta as Record<string, unknown>),
      audience: existing.audience,
    },
    after: {
      slug: input.slug ?? existing.key,
      ...nextJson,
      audience: input.audience !== undefined ? input.audience : existing.audience,
    },
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

/** Archive (soft delete) — sets status='archived' but keeps the row so a
 *  re-publish is one click away. Hard delete is intentionally not exposed
 *  to the admin UI to protect against accidentally orphaning footer links. */
export async function archivePage(ctx: Context, id: string): Promise<Result<void, PageError>> {
  return updatePage(ctx, { id, status: 'archived' })
}

export async function unarchivePage(ctx: Context, id: string): Promise<Result<void, PageError>> {
  return updatePage(ctx, { id, status: 'active' })
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function toPageRow(r: typeof schema.siteContent.$inferSelect): PageRow {
  const meta = (r.valueJson ?? {}) as Partial<PageJson>
  return {
    id: r.id,
    slug: r.key,
    title: meta.title ?? r.key,
    category: meta.category ?? null,
    status: (meta.status as PageStatus | undefined) ?? 'active',
    audience: r.audience,
    body: r.value ?? '',
    seoDescription: meta.seoDescription ?? null,
    version: r.version,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  }
}
