import { and, eq, inArray, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// docs/08 §4.4 — admin CRUD for the casino sub-category section. All
// writes audit_log a row per mutation. Business logic stays here per
// .cursorrules; the API routes are thin parsers/transports.

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export interface SubCategoryListItem {
  id: string
  slug: string
  displayName: string
  type: string
  thumbnailUrl: string | null
  ordering: number
  status: string
  inLobby: boolean
  isFeatured: boolean
  gameCount: number
  createdAt: string
  updatedAt: string
}

export type SubCategoryError =
  | { code: 'not_found' }
  | { code: 'slug_taken' }
  | { code: 'invalid_slug' }
  | { code: 'game_not_found'; gameId: string }
  | { code: 'provider_not_found'; providerId: string }

/* -------------------------------------------------------------------------- */
/* list                                                                       */
/* -------------------------------------------------------------------------- */

export async function listSubCategories(ctx: Context): Promise<SubCategoryListItem[]> {
  const rows = await ctx.db
    .select({
      id: schema.casinoSubCategories.id,
      slug: schema.casinoSubCategories.slug,
      displayName: schema.casinoSubCategories.displayName,
      type: schema.casinoSubCategories.type,
      thumbnailUrl: schema.casinoSubCategories.thumbnailUrl,
      ordering: schema.casinoSubCategories.ordering,
      status: schema.casinoSubCategories.status,
      inLobby: schema.casinoSubCategories.inLobby,
      isFeatured: schema.casinoSubCategories.isFeatured,
      createdAt: schema.casinoSubCategories.createdAt,
      updatedAt: schema.casinoSubCategories.updatedAt,
    })
    .from(schema.casinoSubCategories)
    .orderBy(schema.casinoSubCategories.ordering)

  if (rows.length === 0) return []

  const counts = await ctx.db
    .select({
      subCategoryId: schema.casinoSubCategoryGames.subCategoryId,
      n: sql<number>`count(*)::int`.as('n'),
    })
    .from(schema.casinoSubCategoryGames)
    .groupBy(schema.casinoSubCategoryGames.subCategoryId)
  const countMap = new Map(counts.map((c) => [c.subCategoryId, Number(c.n)]))

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    type: r.type,
    thumbnailUrl: r.thumbnailUrl,
    ordering: r.ordering,
    status: r.status,
    inLobby: r.inLobby,
    isFeatured: r.isFeatured,
    gameCount: countMap.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

/* -------------------------------------------------------------------------- */
/* create / update / delete                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateSubCategoryInput {
  slug: string
  displayName: string
  type?: string
  thumbnailUrl?: string | null
  inLobby?: boolean
  isFeatured?: boolean
  status?: 'active' | 'inactive'
}

export async function createSubCategory(
  ctx: Context,
  input: CreateSubCategoryInput,
): Promise<Result<{ id: string }, SubCategoryError>> {
  if (!SLUG_RE.test(input.slug)) return err({ code: 'invalid_slug' })

  const existing = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.slug, input.slug),
  })
  if (existing) return err({ code: 'slug_taken' })

  const maxOrderRow = await ctx.db
    .select({
      max: sql<number>`coalesce(max(${schema.casinoSubCategories.ordering}), 0)::int`.as('max'),
    })
    .from(schema.casinoSubCategories)
  const nextOrder = (maxOrderRow[0]?.max ?? 0) + 1

  const [row] = await ctx.db
    .insert(schema.casinoSubCategories)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      type: input.type ?? 'slots',
      thumbnailUrl: input.thumbnailUrl ?? null,
      ordering: nextOrder,
      status: input.status ?? 'active',
      inLobby: input.inLobby ?? true,
      isFeatured: input.isFeatured ?? false,
      updatedBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning({ id: schema.casinoSubCategories.id })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.create',
    resourceKind: 'casino_sub_category',
    resourceId: row.id,
    after: { ...input, ordering: nextOrder },
  })

  return ok({ id: row.id })
}

export interface UpdateSubCategoryInput {
  displayName?: string
  type?: string
  thumbnailUrl?: string | null
  inLobby?: boolean
  isFeatured?: boolean
  status?: 'active' | 'inactive'
}

export async function updateSubCategory(
  ctx: Context,
  id: string,
  input: UpdateSubCategoryInput,
): Promise<Result<void, SubCategoryError>> {
  const before = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.id, id),
  })
  if (!before) return err({ code: 'not_found' })

  await ctx.db
    .update(schema.casinoSubCategories)
    .set({
      displayName: input.displayName ?? before.displayName,
      type: input.type ?? before.type,
      thumbnailUrl: input.thumbnailUrl === undefined ? before.thumbnailUrl : input.thumbnailUrl,
      inLobby: input.inLobby ?? before.inLobby,
      isFeatured: input.isFeatured ?? before.isFeatured,
      status: input.status ?? before.status,
      updatedBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : before.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(schema.casinoSubCategories.id, id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.update',
    resourceKind: 'casino_sub_category',
    resourceId: id,
    before: {
      displayName: before.displayName,
      type: before.type,
      thumbnailUrl: before.thumbnailUrl,
      inLobby: before.inLobby,
      isFeatured: before.isFeatured,
      status: before.status,
    },
    after: { ...input },
  })
  return ok(undefined)
}

export async function deleteSubCategory(
  ctx: Context,
  id: string,
): Promise<Result<void, SubCategoryError>> {
  const before = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.id, id),
  })
  if (!before) return err({ code: 'not_found' })

  // Cascade FK removes the join rows automatically; we explicitly delete
  // the parent row so the admin can recycle the slug if they want.
  await ctx.db.delete(schema.casinoSubCategories).where(eq(schema.casinoSubCategories.id, id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.delete',
    resourceKind: 'casino_sub_category',
    resourceId: id,
    before: {
      slug: before.slug,
      displayName: before.displayName,
    },
  })

  return ok(undefined)
}

/* -------------------------------------------------------------------------- */
/* reorder                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reorder sub-categories. `orderedIds` is the desired full ordering;
 * any id not in the list keeps its current ordering value but is
 * pushed below the listed ones.
 */
export async function reorderSubCategories(
  ctx: Context,
  orderedIds: string[],
): Promise<Result<void, SubCategoryError>> {
  if (orderedIds.length === 0) return ok(undefined)

  await ctx.db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(schema.casinoSubCategories)
        .set({ ordering: i + 1, updatedAt: new Date() })
        .where(eq(schema.casinoSubCategories.id, orderedIds[i]))
    }
  })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.reorder',
    resourceKind: 'casino_sub_category',
    after: { orderedIds },
  })

  return ok(undefined)
}

/* -------------------------------------------------------------------------- */
/* games-in-section management                                                */
/* -------------------------------------------------------------------------- */

export interface SectionGameRow {
  gameId: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  category: string
  status: string
  customerFacing: boolean
  rtp: string | null
  ordering: number
}

export async function listGamesInSection(
  ctx: Context,
  subCategoryId: string,
): Promise<SectionGameRow[]> {
  const rows = await ctx.db
    .select({
      gameId: schema.games.id,
      slug: schema.games.slug,
      displayName: schema.games.displayName,
      providerName: schema.gameProviders.displayName,
      providerSlug: schema.gameProviders.slug,
      category: schema.games.category,
      status: schema.games.status,
      customerFacing: schema.games.customerFacing,
      rtp: schema.games.rtp,
      ordering: schema.casinoSubCategoryGames.ordering,
    })
    .from(schema.casinoSubCategoryGames)
    .innerJoin(schema.games, eq(schema.games.id, schema.casinoSubCategoryGames.gameId))
    .leftJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
    .where(eq(schema.casinoSubCategoryGames.subCategoryId, subCategoryId))
    .orderBy(schema.casinoSubCategoryGames.ordering)

  return rows.map((r) => ({
    gameId: r.gameId,
    slug: r.slug,
    displayName: r.displayName,
    providerName: r.providerName ?? '—',
    providerSlug: r.providerSlug ?? '',
    category: r.category,
    status: r.status,
    customerFacing: r.customerFacing,
    rtp: r.rtp,
    ordering: r.ordering,
  }))
}

export async function addGamesToSection(
  ctx: Context,
  subCategoryId: string,
  gameIds: string[],
): Promise<Result<{ added: number; skipped: number }, SubCategoryError>> {
  if (gameIds.length === 0) return ok({ added: 0, skipped: 0 })

  const section = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.id, subCategoryId),
  })
  if (!section) return err({ code: 'not_found' })

  // Verify all games exist before we touch anything; cheaper than a
  // partial failure mid-loop.
  const realGames = await ctx.db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(inArray(schema.games.id, gameIds))
  const realIds = new Set(realGames.map((r) => r.id))

  // Existing memberships so we don't re-insert.
  const existing = await ctx.db
    .select({ gameId: schema.casinoSubCategoryGames.gameId })
    .from(schema.casinoSubCategoryGames)
    .where(
      and(
        eq(schema.casinoSubCategoryGames.subCategoryId, subCategoryId),
        inArray(schema.casinoSubCategoryGames.gameId, gameIds),
      ),
    )
  const alreadyIn = new Set(existing.map((e) => e.gameId))

  const maxOrderRow = await ctx.db
    .select({
      max: sql<number>`coalesce(max(${schema.casinoSubCategoryGames.ordering}), 0)::int`.as('max'),
    })
    .from(schema.casinoSubCategoryGames)
    .where(eq(schema.casinoSubCategoryGames.subCategoryId, subCategoryId))
  let next = (maxOrderRow[0]?.max ?? 0) + 1

  const toInsert: {
    subCategoryId: string
    gameId: string
    ordering: number
    addedBy: string | null
  }[] = []
  let skipped = 0
  for (const gid of gameIds) {
    if (!realIds.has(gid) || alreadyIn.has(gid)) {
      skipped++
      continue
    }
    toInsert.push({
      subCategoryId,
      gameId: gid,
      ordering: next++,
      addedBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
  }

  if (toInsert.length > 0) {
    await ctx.db.insert(schema.casinoSubCategoryGames).values(toInsert)
  }

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.games_add',
    resourceKind: 'casino_sub_category',
    resourceId: subCategoryId,
    after: { added: toInsert.length, skipped, gameIds },
  })

  return ok({ added: toInsert.length, skipped })
}

export async function removeGameFromSection(
  ctx: Context,
  subCategoryId: string,
  gameId: string,
): Promise<Result<void, SubCategoryError>> {
  const section = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.id, subCategoryId),
  })
  if (!section) return err({ code: 'not_found' })

  await ctx.db
    .delete(schema.casinoSubCategoryGames)
    .where(
      and(
        eq(schema.casinoSubCategoryGames.subCategoryId, subCategoryId),
        eq(schema.casinoSubCategoryGames.gameId, gameId),
      ),
    )

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.games_remove',
    resourceKind: 'casino_sub_category',
    resourceId: subCategoryId,
    after: { gameId },
  })

  return ok(undefined)
}

export async function reorderGamesInSection(
  ctx: Context,
  subCategoryId: string,
  orderedGameIds: string[],
): Promise<Result<void, SubCategoryError>> {
  if (orderedGameIds.length === 0) return ok(undefined)

  const section = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.id, subCategoryId),
  })
  if (!section) return err({ code: 'not_found' })

  await ctx.db.transaction(async (tx) => {
    for (let i = 0; i < orderedGameIds.length; i++) {
      await tx
        .update(schema.casinoSubCategoryGames)
        .set({ ordering: i + 1 })
        .where(
          and(
            eq(schema.casinoSubCategoryGames.subCategoryId, subCategoryId),
            eq(schema.casinoSubCategoryGames.gameId, orderedGameIds[i]),
          ),
        )
    }
  })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.sub_category.games_reorder',
    resourceKind: 'casino_sub_category',
    resourceId: subCategoryId,
    after: { orderedGameIds },
  })

  return ok(undefined)
}

/* -------------------------------------------------------------------------- */
/* bulk-add by provider                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pull every game owned by `providerId` (optionally filtered to active /
 * customer-facing only) and add them all to `subCategoryId`. Skips
 * duplicates. Returns the count of inserts and the count of skips.
 */
export async function bulkAddByProvider(
  ctx: Context,
  subCategoryId: string,
  providerId: string,
  options: { activeOnly?: boolean; customerFacingOnly?: boolean } = {},
): Promise<Result<{ added: number; skipped: number }, SubCategoryError>> {
  const section = await ctx.db.query.casinoSubCategories.findFirst({
    where: eq(schema.casinoSubCategories.id, subCategoryId),
  })
  if (!section) return err({ code: 'not_found' })

  const provider = await ctx.db.query.gameProviders.findFirst({
    where: eq(schema.gameProviders.id, providerId),
  })
  if (!provider) return err({ code: 'provider_not_found', providerId })

  const filters = [eq(schema.games.providerId, providerId)]
  if (options.activeOnly) filters.push(eq(schema.games.status, 'active'))
  if (options.customerFacingOnly) filters.push(eq(schema.games.customerFacing, true))

  const games = await ctx.db
    .select({ id: schema.games.id })
    .from(schema.games)
    .where(and(...filters))

  const gameIds = games.map((g) => g.id)
  return addGamesToSection(ctx, subCategoryId, gameIds)
}
