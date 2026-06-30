import { and, eq, isNull, notInArray, or } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { getAleaClient } from '../adapters/alea/index'
import type { Context } from '../context'

// docs/05 §5.7 — game catalog sync. Pulls Alea's available-games list
// (real or mock) into our `games` table so the lobby has stable IDs to
// reference and per-game RTP/volatility metadata for the players UI.
//
// Idempotent: existing rows match on (provider_id, external_id) and are
// updated in place; new rows are inserted.

export interface SyncGamesInput {
  /** docs/05 §5 — sandbox mode returns the gamesAvailable list. */
  mode?: 'sandbox' | 'production'
}

export interface SyncGamesResult {
  inserted: number
  updated: number
  mode: 'mock' | 'real'
}

const DEFAULT_AGGREGATOR_SLUG = 'alea'

// export async function syncGamesFromAlea(
//   ctx: Context,
//   input: SyncGamesInput = {},
// ): Promise<SyncGamesResult> {
//   const client = getAleaClient()
//   const remoteGames = await client.listGames({ mode: input.mode ?? 'sandbox' })

//   // Ensure the Alea aggregator row exists; create on demand so the sync
//   // works on a fresh database.
//   let aggregator = await ctx.db.query.aggregators.findFirst({
//     where: eq(schema.aggregators.slug, DEFAULT_AGGREGATOR_SLUG),
//   })
//   if (!aggregator) {
//     const [row] = await ctx.db
//       .insert(schema.aggregators)
//       .values({ slug: DEFAULT_AGGREGATOR_SLUG, displayName: 'Alea' })
//       .returning()
//     aggregator = row
//   }

//   // Provider rows — group by providerSlug so we don't have to round-trip
//   // for every game. Insert any new ones, then fetch ids for upserts.
//   const providerSlugs = Array.from(new Set(remoteGames.map((g) => g.providerSlug)))
//   const providerByslug = new Map<string, string>()
//   for (const slug of providerSlugs) {
//     const sample = remoteGames.find((g) => g.providerSlug === slug)
//     const displayName = sample?.providerDisplayName ?? slug
//     const existing = await ctx.db.query.gameProviders.findFirst({
//       where: eq(schema.gameProviders.slug, slug),
//     })
//     if (existing) {
//       providerByslug.set(slug, existing.id)
//       // Refresh display name on every sync so a wiki rename propagates.
//       if (existing.displayName !== displayName) {
//         await ctx.db
//           .update(schema.gameProviders)
//           .set({ displayName, updatedAt: new Date() })
//           .where(eq(schema.gameProviders.id, existing.id))
//       }
//       continue
//     }
//     const [row] = await ctx.db
//       .insert(schema.gameProviders)
//       .values({
//         aggregatorId: aggregator!.id,
//         slug,
//         displayName,
//       })
//       .returning()
//     providerByslug.set(slug, row.id)
//   }

//   let inserted = 0
//   let updated = 0
//   let order = 0
//   for (const remote of remoteGames) {
//     const providerId = providerByslug.get(remote.providerSlug)
//     if (!providerId) continue

//     const availableInGc = remote.availableInGc ?? true
//     const availableInSc = remote.availableInSc ?? true

//     // Match by externalId OR slug — both are uniquely-constrained in
//     // schema.games. The OR-match lets us recover gracefully when a mock
//     // catalog refresh reuses a slug that an older row already owns.
//     const existing = await ctx.db.query.games.findFirst({
//       where: or(eq(schema.games.externalId, remote.externalId), eq(schema.games.slug, remote.slug)),
//     })
//     if (existing) {
//       await ctx.db
//         .update(schema.games)
//         .set({
//           providerId,
//           slug: remote.slug,
//           externalId: remote.externalId,
//           displayName: remote.displayName,
//           category: remote.category,
//           thumbnailUrl: remote.thumbnailUrl ?? undefined,
//           bannerUrl: remote.bannerUrl ?? undefined,
//           rtp: remote.rtp !== null ? String(remote.rtp) : undefined,
//           volatility: remote.volatility ?? undefined,
//           availableInGc,
//           availableInSc,
//           isFeatured: remote.isFeatured ?? existing.isFeatured,
//           isNew: remote.isNew ?? existing.isNew,
//           status: 'active',
//           customerFacing: true,
//           deletedAt: null,
//           updatedAt: new Date(),
//         })
//         .where(eq(schema.games.id, existing.id))
//       updated++
//     } else {
//       await ctx.db.insert(schema.games).values({
//         providerId,
//         slug: remote.slug,
//         externalId: remote.externalId,
//         displayName: remote.displayName,
//         category: remote.category,
//         thumbnailUrl: remote.thumbnailUrl,
//         bannerUrl: remote.bannerUrl,
//         rtp: remote.rtp !== null ? String(remote.rtp) : null,
//         volatility: remote.volatility,
//         status: 'active',
//         customerFacing: true,
//         availableInGc,
//         availableInSc,
//         isFeatured: remote.isFeatured ?? false,
//         isNew: remote.isNew ?? false,
//         lobbyOrder: order++,
//       })
//       inserted++
//     }
//   }

//   // Retire the historical `mock-studio` rows from the original prompt-06
//   // mock catalog so they don't haunt the lobby after a catalog refresh.
//   // Only runs in mock mode — never touches real provider rows.
//   if (client.mode === 'mock') {
//     const stale = await ctx.db.query.gameProviders.findFirst({
//       where: eq(schema.gameProviders.slug, 'mock-studio'),
//     })
//     if (stale) {
//       await ctx.db
//         .update(schema.games)
//         .set({ deletedAt: new Date(), updatedAt: new Date() })
//         .where(eq(schema.games.providerId, stale.id))
//     }
//     // Retire any active game whose externalId isn't present in the
//     // current mock catalog. This soft-deletes legacy seeds (Cosmic Cash,
//     // Golden Crash, Atomic Bonanza, etc.) from the previous mock so the
//     // lobby strictly mirrors the live coinfrenzy.com.
//     const remoteIds = remoteGames.map((g) => g.externalId)
//     if (remoteIds.length > 0) {
//       await ctx.db
//         .update(schema.games)
//         .set({ deletedAt: new Date(), updatedAt: new Date() })
//         .where(and(notInArray(schema.games.externalId, remoteIds), isNull(schema.games.deletedAt)))
//     }
//   }

//   return { inserted, updated, mode: client.mode }
// }

export async function syncGamesFromAlea(
  ctx: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remoteGames: any[],
): Promise<SyncGamesResult> {
  try {
    const client = getAleaClient()

    if (client.mode === 'mock') {
      remoteGames = await client.listGames({ mode: 'sandbox' })
    }

    // Ensure the Alea aggregator row exists; create on demand so the sync
    // works on a fresh database.
    let aggregator = await ctx.db.query.aggregators.findFirst({
      where: eq(schema.aggregators.slug, DEFAULT_AGGREGATOR_SLUG),
    })
    if (!aggregator) {
      const [row] = await ctx.db
        .insert(schema.aggregators)
        .values({ slug: DEFAULT_AGGREGATOR_SLUG, displayName: 'Alea' })
        .returning()
      aggregator = row
    }

    // Provider rows — group by providerSlug so we don't have to round-trip
    // for every game. Insert any new ones, then fetch ids for upserts.
    const providerSlugs = Array.from(new Set(remoteGames.map((g) => g.providerSlug)))
    const providerByslug = new Map<string, string>()
    for (const slug of providerSlugs) {
      const sample = remoteGames.find((g) => g.providerSlug === slug)
      const displayName = sample?.providerDisplayName ?? slug
      const existing = await ctx.db.query.gameProviders.findFirst({
        where: eq(schema.gameProviders.slug, slug),
      })
      if (existing) {
        providerByslug.set(slug, existing.id)
        // Refresh display name on every sync so a wiki rename propagates.
        if (existing.displayName !== displayName) {
          await ctx.db
            .update(schema.gameProviders)
            .set({ displayName, updatedAt: new Date() })
            .where(eq(schema.gameProviders.id, existing.id))
        }
        continue
      }
      const [row] = await ctx.db
        .insert(schema.gameProviders)
        .values({
          aggregatorId: aggregator!.id,
          slug,
          displayName,
        })
        .returning()
      providerByslug.set(slug, row.id)
    }

    let inserted = 0
    let updated = 0
    let order = 0
    for (const remote of remoteGames) {
      const providerId = providerByslug.get(remote.providerSlug)
      if (!providerId) continue

      const availableInGc = remote.availableInGc ?? true
      const availableInSc = remote.availableInSc ?? true

      // Match by externalId OR slug — both are uniquely-constrained in
      // schema.games. The OR-match lets us recover gracefully when a mock
      // catalog refresh reuses a slug that an older row already owns.
      const existing = await ctx.db.query.games.findFirst({
        where: or(
          eq(schema.games.externalId, remote.externalId),
          eq(schema.games.slug, remote.slug),
        ),
      })
      if (existing) {
        await ctx.db
          .update(schema.games)
          .set({
            providerId,
            slug: remote.slug,
            externalId: remote.externalId,
            displayName: remote.displayName,
            category: remote.category,
            thumbnailUrl: remote.thumbnailUrl ?? undefined,
            bannerUrl: remote.bannerUrl ?? undefined,
            rtp: remote.rtp !== null ? String(remote.rtp) : undefined,
            volatility: remote.volatility ?? undefined,
            availableInGc,
            availableInSc,
            isFeatured: remote.isFeatured ?? existing.isFeatured,
            isNew: remote.isNew ?? existing.isNew,
            status: 'active',
            customerFacing: true,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.games.id, existing.id))
        updated++
      } else {
        await ctx.db.insert(schema.games).values({
          providerId,
          slug: remote.slug,
          externalId: remote.externalId,
          displayName: remote.displayName,
          category: remote.category,
          thumbnailUrl: remote.thumbnailUrl,
          bannerUrl: remote.bannerUrl,
          rtp: remote.rtp !== null ? String(remote.rtp) : null,
          volatility: remote.volatility,
          status: 'active',
          customerFacing: true,
          availableInGc,
          availableInSc,
          isFeatured: remote.isFeatured ?? false,
          isNew: remote.isNew ?? false,
          lobbyOrder: order++,
          deletedAt: null,
        })
        inserted++
      }
    }

    // Retire the historical `mock-studio` rows from the original prompt-06
    // mock catalog so they don't haunt the lobby after a catalog refresh.
    // Only runs in mock mode — never touches real provider rows.
    if (client.mode === 'mock') {
      const stale = await ctx.db.query.gameProviders.findFirst({
        where: eq(schema.gameProviders.slug, 'mock-studio'),
      })
      if (stale) {
        await ctx.db
          .update(schema.games)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.games.providerId, stale.id))
      }
      // Retire any active game whose externalId isn't present in the
      // current mock catalog. This soft-deletes legacy seeds (Cosmic Cash,
      // Golden Crash, Atomic Bonanza, etc.) from the previous mock so the
      // lobby strictly mirrors the live coinfrenzy.com.
      const remoteIds = remoteGames.map((g) => g.externalId)
      if (remoteIds.length > 0) {
        await ctx.db
          .update(schema.games)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(notInArray(schema.games.externalId, remoteIds), isNull(schema.games.deletedAt)),
          )
      }
    }

    return { inserted, updated, mode: client.mode || 'real' }
  } catch (error) {
    ctx.logger.error('Error syncing games from Alea:', { error })
    throw error
  }
}
