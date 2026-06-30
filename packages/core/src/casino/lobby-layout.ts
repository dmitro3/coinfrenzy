import { and, eq, inArray, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// docs/08 §4.3 — Game Lobby layout. The admin WYSIWYG editor and the
// player lobby both read from `getLobbyLayout()`; `saveLobbyLayout()`
// persists the whole section+games arrangement in one transaction so
// the admin's `Save layout` button is atomic.

export interface LobbyLayoutGame {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  thumbnailUrl: string | null
  rtp: string | null
  isFeatured: boolean
  isNew: boolean
  status: string
  customerFacing: boolean
  availableInGc: boolean
  availableInSc: boolean
}

export interface LobbyLayoutSection {
  id: string
  slug: string
  displayName: string
  type: string
  thumbnailUrl: string | null
  ordering: number
  status: string
  inLobby: boolean
  isFeatured: boolean
  games: LobbyLayoutGame[]
}

export interface LobbyLayout {
  sections: LobbyLayoutSection[]
}

/**
 * Full lobby layout — every section and the games in each, in display
 * order. Used by the admin editor (which then mutates and saves) and
 * by the player lobby (which renders read-only).
 */
export async function getLobbyLayout(
  ctx: Context,
  options: { adminView?: boolean } = {},
): Promise<LobbyLayout> {
  const sectionFilter = options.adminView
    ? undefined
    : and(
        eq(schema.casinoSubCategories.status, 'active'),
        eq(schema.casinoSubCategories.inLobby, true),
      )

  const sectionRows = await ctx.db
    .select()
    .from(schema.casinoSubCategories)
    .where(sectionFilter)
    .orderBy(schema.casinoSubCategories.ordering)

  if (sectionRows.length === 0) return { sections: [] }

  const sectionIds = sectionRows.map((s) => s.id)

  const gameRows = await ctx.db
    .select({
      subCategoryId: schema.casinoSubCategoryGames.subCategoryId,
      ordering: schema.casinoSubCategoryGames.ordering,
      id: schema.games.id,
      slug: schema.games.slug,
      displayName: schema.games.displayName,
      providerName: schema.gameProviders.displayName,
      providerSlug: schema.gameProviders.slug,
      thumbnailUrl: schema.games.thumbnailUrl,
      rtp: schema.games.rtp,
      isFeatured: schema.games.isFeatured,
      isNew: schema.games.isNew,
      status: schema.games.status,
      customerFacing: schema.games.customerFacing,
      availableInGc: schema.games.availableInGc,
      availableInSc: schema.games.availableInSc,
    })
    .from(schema.casinoSubCategoryGames)
    .innerJoin(schema.games, eq(schema.games.id, schema.casinoSubCategoryGames.gameId))
    .leftJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
    .where(
      options.adminView
        ? inArray(schema.casinoSubCategoryGames.subCategoryId, sectionIds)
        : and(
            inArray(schema.casinoSubCategoryGames.subCategoryId, sectionIds),
            eq(schema.games.status, 'active'),
            eq(schema.games.customerFacing, true),
            sql`${schema.games.deletedAt} is null`,
          ),
    )
    .orderBy(schema.casinoSubCategoryGames.subCategoryId, schema.casinoSubCategoryGames.ordering)

  const grouped = new Map<string, LobbyLayoutGame[]>()
  for (const g of gameRows) {
    const bucket = grouped.get(g.subCategoryId) ?? []
    bucket.push({
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      providerName: g.providerName ?? '—',
      providerSlug: g.providerSlug ?? '',
      thumbnailUrl: g.thumbnailUrl,
      rtp: g.rtp,
      isFeatured: g.isFeatured,
      isNew: g.isNew,
      status: g.status,
      customerFacing: g.customerFacing,
      availableInGc: g.availableInGc,
      availableInSc: g.availableInSc,
    })
    grouped.set(g.subCategoryId, bucket)
  }

  return {
    sections: sectionRows.map((s) => ({
      id: s.id,
      slug: s.slug,
      displayName: s.displayName,
      type: s.type,
      thumbnailUrl: s.thumbnailUrl,
      ordering: s.ordering,
      status: s.status,
      inLobby: s.inLobby,
      isFeatured: s.isFeatured,
      games: grouped.get(s.id) ?? [],
    })),
  }
}

export interface SaveLobbyLayoutInput {
  sections: {
    id: string
    gameIds: string[]
  }[]
}

export type SaveLobbyLayoutError = { code: 'section_not_found'; sectionId: string }

/**
 * Persist a full lobby layout in one transaction. `sections` is the
 * ordered list of section ids; each section carries its ordered
 * gameIds. Games not listed in a section's `gameIds` are detached
 * from that section.
 */
export async function saveLobbyLayout(
  ctx: Context,
  input: SaveLobbyLayoutInput,
): Promise<Result<void, SaveLobbyLayoutError>> {
  const before = await getLobbyLayout(ctx, { adminView: true })

  // Verify every section id exists before any writes happen.
  const knownIds = new Set(before.sections.map((s) => s.id))
  for (const s of input.sections) {
    if (!knownIds.has(s.id)) {
      return err({ code: 'section_not_found', sectionId: s.id })
    }
  }

  await ctx.db.transaction(async (tx) => {
    // Re-number sections in the order supplied.
    for (let i = 0; i < input.sections.length; i++) {
      await tx
        .update(schema.casinoSubCategories)
        .set({ ordering: i + 1, updatedAt: new Date() })
        .where(eq(schema.casinoSubCategories.id, input.sections[i].id))
    }

    // For each section: replace its (game, ordering) memberships.
    for (const section of input.sections) {
      await tx
        .delete(schema.casinoSubCategoryGames)
        .where(eq(schema.casinoSubCategoryGames.subCategoryId, section.id))
      if (section.gameIds.length === 0) continue
      await tx.insert(schema.casinoSubCategoryGames).values(
        section.gameIds.map((gameId, idx) => ({
          subCategoryId: section.id,
          gameId,
          ordering: idx + 1,
          addedBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
        })),
      )
    }
  })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.lobby.layout_save',
    resourceKind: 'casino_lobby_layout',
    before: {
      sections: before.sections.map((s) => ({ id: s.id, gameCount: s.games.length })),
    },
    after: {
      sections: input.sections.map((s) => ({ id: s.id, gameCount: s.gameIds.length })),
    },
  })

  return ok(undefined)
}
