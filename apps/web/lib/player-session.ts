import 'server-only'

import { cache } from 'react'
import { randomUUID } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import {
  auth as coreAuth,
  createAfterCommitQueue,
  noopLogger,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { auth } from './auth'

// docs/09 §5.1 — server-side helpers for reading the current player.
// Better Auth handles the cookie + session lookup; we layer on a players
// row read so the rest of the app gets the domain entity.
//
// PERFORMANCE: `getPlayerSession` is called by both the player layout
// AND most pages (via `requirePlayerSession`) during a single render.
// We wrap it in `React.cache(...)` so the auth + player-row lookups
// only run ONCE per request — without this, every page render was
// doing the work twice (layout + page) which added ~150-300ms of
// otherwise-avoidable DB latency to every navigation.

export interface PlayerSessionResult {
  user: {
    id: string
    email: string
    name: string | null
    emailVerified: boolean
  }
  player: {
    id: string
    email: string
    status: string
    state: string | null
    blockedStateGcOnly: boolean
    rgSelfExcludedUntil: Date | null
  }
}

/**
 * DEV-ONLY: when `DEV_PLAYER_AUTOLOGIN=true` and we're not in production,
 * skip Better Auth entirely and impersonate the first active, non-internal
 * player in the DB. Lets the founder browse the player surface without
 * having to sign up + verify in dev. Hard-rejected if NODE_ENV='production'
 * even if the flag is on.
 */
async function devAutoLoginSession(): Promise<PlayerSessionResult | null> {
  if (process.env.NODE_ENV === 'production') return null
  if (process.env.DEV_PLAYER_AUTOLOGIN !== 'true') return null

  const db = getDb()
  const [row] = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      status: schema.players.status,
      state: schema.players.state,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
      metadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(
      and(
        eq(schema.players.isInternalAccount, false),
        eq(schema.players.status, 'active'),
        isNull(schema.players.deletedAt),
      ),
    )
    .orderBy(sql`${schema.players.firstSeenAt} desc`)
    .limit(1)

  if (!row) return null

  // players.id == auth_user.id by design (see player-signup.ts), so we use
  // the same UUID for both surfaces of the session result.
  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.email.split('@')[0] ?? row.email,
      emailVerified: true,
    },
    player: {
      id: row.id,
      email: row.email,
      status: row.status,
      state: row.state,
      blockedStateGcOnly: Boolean(
        (row.metadata as { blocked_state_gc_only?: boolean } | null)?.blocked_state_gc_only,
      ),
      rgSelfExcludedUntil: row.rgSelfExcludedUntil,
    },
  }
}

export const getPlayerSession = cache(async (): Promise<PlayerSessionResult | null> => {
  // Dev autologin short-circuits the auth flow entirely. Production is
  // hard-rejected inside `devAutoLoginSession` so this branch is a no-op
  // when the flag/env isn't right.
  const dev = await devAutoLoginSession()
  if (dev) return dev

  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session?.user) return null

  const player = await coreAuth.getPlayerByAuthId(getDb(), session.user.id)
  if (!player) {
    // Auth user exists but player provisioning never completed (e.g. the
    // post-create hook crashed). We let the player through to a "complete
    // your profile" route in a future prompt; for now treat as unauthed.
    return null
  }

  // docs/06 §13 — daily login trigger. Idempotent: fires once per UTC day
  // per player. Previously this was awaited on the critical render path,
  // adding ~50-300ms to EVERY navigation. Since the player popover
  // (`/api/player/bonus/state`) reads the awarded row directly + the
  // player can also manually claim via the popover, the daily-login
  // side-effect doesn't need to block the page response. Fire it on a
  // microtask so the response is committed first; the engine still runs.
  fireDailyLoginInBackground(player.id)

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      emailVerified: session.user.emailVerified,
    },
    player: {
      id: player.id,
      email: player.email,
      status: player.status,
      state: player.state,
      blockedStateGcOnly: Boolean(player.metadata?.blocked_state_gc_only),
      rgSelfExcludedUntil: player.rgSelfExcludedUntil,
    },
  }
})

// Per-process guard so we don't fire the daily-login engine on every page
// render — once per player per server lifetime is enough; the engine
// itself is also idempotent on (player, UTC day). Cleared when the
// process restarts. Cheap belt-and-braces over the in-engine guard so
// even the "no-op" path doesn't hit the DB on every page load.
const recordedThisProcess = new Set<string>()

function fireDailyLoginInBackground(playerId: string): void {
  if (recordedThisProcess.has(playerId)) return
  recordedThisProcess.add(playerId)
  // Schedule on the next tick so the React render returns first.
  queueMicrotask(() => {
    void (async () => {
      try {
        const actor: Actor = { kind: 'player', playerId }
        const queue = createAfterCommitQueue(noopLogger)
        const ctx: Context = {
          db: getDb(),
          logger: noopLogger,
          actor,
          reqId: randomUUID(),
          afterCommit: queue.push,
        }
        await coreAuth.recordPlayerLogin(ctx, { playerId })
        await queue.flush()
      } catch (e) {
        console.warn('[player-session] recordPlayerLogin failed', {
          playerId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    })()
  })
}

export async function requirePlayerSession(redirectTo?: string): Promise<PlayerSessionResult> {
  const session = await getPlayerSession()
  if (!session) {
    const target = redirectTo ? `/login?next=${encodeURIComponent(redirectTo)}` : '/login'
    redirect(target)
  }
  return session
}
