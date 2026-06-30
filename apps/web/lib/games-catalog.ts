import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { isMockEnabled, type CoinCurrency } from '@coinfrenzy/config'
import { games as gamesCore } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { buildWebhookContext } from '@/lib/webhook-context'

// docs/05 §5.7 + docs/10 §4.2 — single source of truth for "what games
// does the lobby render?". Centralized here so /lobby and /games both
// stay in sync, and so we don't run the auto-seed twice on a fresh DB.

export interface CatalogGame {
  id: string
  slug: string
  externalId: string
  displayName: string
  category: string
  thumbnailUrl: string | null
  rtp: string | null
  volatility: string | null
  providerSlug: string
  providerDisplayName: string
  availableInGc: boolean
  availableInSc: boolean
  isFeatured: boolean
  isNew: boolean
}

interface LoadCatalogOptions {
  currency?: CoinCurrency
}

export async function loadGamesCatalog(options: LoadCatalogOptions = {}): Promise<CatalogGame[]> {
  const db = getDb()

  async function fetchRows() {
    return db
      .select({
        id: schema.games.id,
        slug: schema.games.slug,
        externalId: schema.games.externalId,
        displayName: schema.games.displayName,
        category: schema.games.category,
        thumbnailUrl: schema.games.thumbnailUrl,
        rtp: schema.games.rtp,
        volatility: schema.games.volatility,
        availableInGc: schema.games.availableInGc,
        availableInSc: schema.games.availableInSc,
        isFeatured: schema.games.isFeatured,
        isNew: schema.games.isNew,
        providerSlug: schema.gameProviders.slug,
        providerDisplayName: schema.gameProviders.displayName,
      })
      .from(schema.games)
      .innerJoin(schema.gameProviders, eq(schema.games.providerId, schema.gameProviders.id))
      .where(
        and(
          eq(schema.games.status, 'active'),
          eq(schema.games.customerFacing, true),
          isNull(schema.games.deletedAt),
        ),
      )
      .orderBy(
        desc(schema.games.isFeatured),
        asc(schema.games.lobbyOrder),
        asc(schema.games.displayName),
      )
  }

  let rows = await fetchRows()

  // docs/05 §5.7 — first-run convenience: in mock mode, lazily hydrate
  // the catalog from the mock Alea adapter so the lobby has tiles to
  // show without any extra wiring. Real mode ships catalog via admin.
  //
  // We trigger the sync in three cases:
  //   - table is empty (fresh DB)
  //   - the legacy `mock-studio` provider rows are still alive (the
  //     pre-refactor catalog used that provider; the sync's cleanup
  //     pass retires them)
  //   - any currently-active game points at the legacy provider id
  //     (defensive: catches partial-sync states)
  if (isMockEnabled('alea')) {
    let needsSync = rows.length === 0
    if (!needsSync) {
      const staleProvider = await db.query.gameProviders.findFirst({
        where: eq(schema.gameProviders.slug, 'mock-studio'),
      })
      if (staleProvider) {
        const [staleCount] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.games)
          .where(and(eq(schema.games.providerId, staleProvider.id), isNull(schema.games.deletedAt)))
        needsSync = (staleCount?.n ?? 0) > 0
      }
    }
    // Re-sync once when the existing rows still have null thumbnails or
    // the legacy `/games/...` prefix that collided with the middleware
    // gating matcher — the M5 redesign moved them under `/game-art/...`.
    // Also picks up the original blackjack `.jpeg` once we re-crop it to
    // a 3:4 `.png` so it matches the rest of the Originals composition.
    if (!needsSync) {
      const [stalePaths] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.games)
        .where(
          and(
            eq(schema.games.status, 'active'),
            eq(schema.games.customerFacing, true),
            isNull(schema.games.deletedAt),
            sql`(
              ${schema.games.thumbnailUrl} is null
              or ${schema.games.thumbnailUrl} like '/games/%'
              or ${schema.games.thumbnailUrl} like '%.jpeg'
            )`,
          ),
        )
      needsSync = (stalePaths?.n ?? 0) > 0
    }
    // Re-sync when the canonical Originals from the live coinfrenzy.com
    // (Plinko / Blackjack / Keno / Cross / Roulette) are missing from
    // the catalog. Acts as a "catalog version" sentinel so adding new
    // mock games picks them up on the next page load without a manual
    // reseed.
    if (!needsSync) {
      const sentinel = await db.query.games.findFirst({
        where: and(eq(schema.games.slug, 'plinko'), isNull(schema.games.deletedAt)),
      })
      needsSync = !sentinel
    }
    if (needsSync) {
      const { ctx } = buildWebhookContext('alea-bootstrap')
      await gamesCore.syncGamesFromAlea(ctx, [])
      rows = await fetchRows()
    }
  }

  const filtered = options.currency
    ? rows.filter((g) => (options.currency === 'GC' ? g.availableInGc : g.availableInSc))
    : rows

  return filtered.map((g) => ({
    ...g,
    availableInGc: g.availableInGc ?? true,
    availableInSc: g.availableInSc ?? true,
    isFeatured: g.isFeatured ?? false,
    isNew: g.isNew ?? false,
  }))
}

/** Count of customer-facing games, used to decide whether to auto-seed
 *  before rendering server components. */
export async function countActiveGames(): Promise<number> {
  const db = getDb()
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.games)
    .where(
      and(
        eq(schema.games.status, 'active'),
        eq(schema.games.customerFacing, true),
        isNull(schema.games.deletedAt),
      ),
    )
  return row?.n ?? 0
}

/* -------------------------------------------------------------------------- */
/* DB-driven lobby layout                                                     */
/* -------------------------------------------------------------------------- */

export interface CatalogLobbySection {
  id: string
  slug: string
  displayName: string
  games: CatalogGame[]
}

/**
 * Build the player lobby layout from `casino_sub_categories` +
 * `casino_sub_category_games` (added in migration 0012). Returns one
 * `CatalogLobbySection` per visible row in `casino_sub_categories`
 * (`status='active'` and `in_lobby=true`), each with its games in
 * `casino_sub_category_games.ordering`.
 *
 * The admin Game Lobby WYSIWYG editor saves into the same tables so what
 * an admin arranges here is what players see.
 *
 * If no sections exist (e.g. the migration hasn't been run), returns an
 * empty array — callers fall back to `loadGamesCatalog()` + the legacy
 * `player-categories.ts` mapping.
 */
export async function loadDbLobbySections(
  options: LoadCatalogOptions = {},
): Promise<CatalogLobbySection[]> {
  const db = getDb()

  const sections = await db
    .select({
      id: schema.casinoSubCategories.id,
      slug: schema.casinoSubCategories.slug,
      displayName: schema.casinoSubCategories.displayName,
      ordering: schema.casinoSubCategories.ordering,
    })
    .from(schema.casinoSubCategories)
    .where(
      and(
        eq(schema.casinoSubCategories.status, 'active'),
        eq(schema.casinoSubCategories.inLobby, true),
      ),
    )
    .orderBy(asc(schema.casinoSubCategories.ordering))

  if (sections.length === 0) return []

  const sectionIds = sections.map((s) => s.id)
  await backfillEmptyDefaultLobbySections(sectionIds)

  const games = await db
    .select({
      subCategoryId: schema.casinoSubCategoryGames.subCategoryId,
      ordering: schema.casinoSubCategoryGames.ordering,
      id: schema.games.id,
      slug: schema.games.slug,
      externalId: schema.games.externalId,
      displayName: schema.games.displayName,
      category: schema.games.category,
      thumbnailUrl: schema.games.thumbnailUrl,
      rtp: schema.games.rtp,
      volatility: schema.games.volatility,
      availableInGc: schema.games.availableInGc,
      availableInSc: schema.games.availableInSc,
      isFeatured: schema.games.isFeatured,
      isNew: schema.games.isNew,
      providerSlug: schema.gameProviders.slug,
      providerDisplayName: schema.gameProviders.displayName,
    })
    .from(schema.casinoSubCategoryGames)
    .innerJoin(schema.games, eq(schema.games.id, schema.casinoSubCategoryGames.gameId))
    .innerJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
    .where(
      and(
        inArray(schema.casinoSubCategoryGames.subCategoryId, sectionIds),
        eq(schema.games.status, 'active'),
        eq(schema.games.customerFacing, true),
        isNull(schema.games.deletedAt),
      ),
    )
    .orderBy(asc(schema.casinoSubCategoryGames.ordering))

  const grouped = new Map<string, CatalogGame[]>()
  for (const g of games) {
    if (options.currency === 'GC' && !g.availableInGc) continue
    if (options.currency === 'SC' && !g.availableInSc) continue
    const bucket = grouped.get(g.subCategoryId) ?? []
    bucket.push({
      id: g.id,
      slug: g.slug,
      externalId: g.externalId,
      displayName: g.displayName,
      category: g.category,
      thumbnailUrl: g.thumbnailUrl,
      rtp: g.rtp,
      volatility: g.volatility,
      providerSlug: g.providerSlug,
      providerDisplayName: g.providerDisplayName,
      availableInGc: g.availableInGc ?? true,
      availableInSc: g.availableInSc ?? true,
      isFeatured: g.isFeatured ?? false,
      isNew: g.isNew ?? false,
    })
    grouped.set(g.subCategoryId, bucket)
  }

  return sections.map((s) => ({
    id: s.id,
    slug: s.slug,
    displayName: s.displayName,
    games: grouped.get(s.id) ?? [],
  }))
}

async function backfillEmptyDefaultLobbySections(sectionIds: string[]): Promise<void> {
  if (sectionIds.length === 0) return

  const db = getDb()
  const sectionIdList = sql.join(
    sectionIds.map((id) => sql`${id}`),
    sql`, `,
  )
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.casinoSubCategoryGames)
    .where(inArray(schema.casinoSubCategoryGames.subCategoryId, sectionIds))

  if ((existing?.n ?? 0) > 0) return

  await db.execute(sql`
    insert into casino_sub_category_games (sub_category_id, game_id, ordering)
    select
      sc.id,
      g.id,
      coalesce(g.lobby_order, 0)
    from games g
    join casino_sub_categories sc on sc.slug = (
      case lower(coalesce(g.category, ''))
        when 'slots' then 'slots'
        when 'slot' then 'slots'
        when 'originals' then 'originals'
        when 'original' then 'originals'
        when 'crash' then 'originals'
        when 'table' then 'originals'
        when 'card' then 'originals'
        when 'instant' then 'originals'
        when 'live-dealer' then 'live-dealers'
        when 'live-dealers' then 'live-dealers'
        when 'live-casino' then 'live-dealers'
        when 'live' then 'live-dealers'
        when 'game-show' then 'game-shows'
        when 'game-shows' then 'game-shows'
        when 'gameshow' then 'game-shows'
        when 'live-game' then 'live-games'
        when 'live-games' then 'live-games'
        else 'originals'
      end
    )
    where sc.id in (${sectionIdList})
      and sc.status = 'active'
      and sc.in_lobby = true
      and g.deleted_at is null
      and g.status = 'active'
      and g.customer_facing = true
    on conflict (sub_category_id, game_id) do nothing
  `)
}
