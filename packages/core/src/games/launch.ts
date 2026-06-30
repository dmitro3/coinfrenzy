import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import { env, type CoinCurrency } from '@coinfrenzy/config'

import { getAleaClient } from '../adapters/alea/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'
import { getBalance } from '../ledger/balance'

// docs/05 §5.2 — game session launch. Validates eligibility, creates our
// game_sessions row, calls Alea, stores the session token + play URL.

export interface LaunchGameInput {
  playerId: string
  gameId: string
  currency: CoinCurrency
  /** Optional override — used by the in-app mock player return URL. */
  returnUrl?: string
  /** Captured at launch for compliance + RG forensics. */
  ip?: string | null
  state?: string | null
  isMobile?: boolean
}

export interface LaunchGameSuccess {
  sessionId: string
  playUrl: string
  externalGameId: string
}

export type LaunchGameError =
  | { code: 'game_not_found' }
  | { code: 'game_not_available'; status: string }
  | { code: 'game_not_available_for_currency'; currency: CoinCurrency }
  | { code: 'wallet_missing'; currency: CoinCurrency }
  | { code: 'self_excluded' }
  | { code: 'kyc_required' }

export async function launchGame(
  ctx: Context,
  input: LaunchGameInput,
): Promise<Result<LaunchGameSuccess, LaunchGameError>> {
  const gameRows = await ctx.db
    .select({
      id: schema.games.id,
      slug: schema.games.slug,
      externalId: schema.games.externalId,
      status: schema.games.status,
      customerFacing: schema.games.customerFacing,
      availableInGc: schema.games.availableInGc,
      availableInSc: schema.games.availableInSc,
      providerId: schema.games.providerId,
    })
    .from(schema.games)
    .where(eq(schema.games.id, input.gameId))
    .limit(1)
  const game = gameRows[0]
  if (!game) return err({ code: 'game_not_found' })

  if (game.status !== 'active' || !game.customerFacing) {
    return err({ code: 'game_not_available', status: game.status })
  }
  if (input.currency === 'GC' && !game.availableInGc) {
    return err({ code: 'game_not_available_for_currency', currency: input.currency })
  }
  if (input.currency === 'SC' && !game.availableInSc) {
    return err({ code: 'game_not_available_for_currency', currency: input.currency })
  }

  // docs/02 §6 + docs/09 §1 — eligibility: RG self-exclusion check + KYC
  // level gating for SC play.
  const playerRows = await ctx.db
    .select({
      id: schema.players.id,
      kycLevel: schema.players.kycLevel,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)
  const player = playerRows[0]
  if (player?.rgSelfExcludedUntil && player.rgSelfExcludedUntil > new Date()) {
    return err({ code: 'self_excluded' })
  }
  if (input.currency === 'SC' && (player?.kycLevel ?? 0) < 2) {
    return err({ code: 'kyc_required' })
  }

  const balance = await getBalance(ctx, input.playerId, input.currency)
  if (!balance.ok) {
    return err({ code: 'wallet_missing', currency: input.currency })
  }

  const sessionId = randomUUID()
  await ctx.db.insert(schema.gameSessions).values({
    id: sessionId,
    playerId: input.playerId,
    gameId: game.id,
    currency: input.currency,
    status: 'active',
    launchIp: input.ip ?? null,
    launchState: input.state ?? null,
    startedAt: new Date(),
  })

  const alea = getAleaClient()
  const resolvedReturnUrl =
    input.returnUrl ??
    (env().PLAYER_BASE_URL ? new URL('/casino-games', env().PLAYER_BASE_URL).toString() : undefined)

  let aleaSession: { sessionToken: string; playUrl: string }
  if (alea.mode === 'mock') {
    aleaSession = await alea.createSession({
      casinoSessionId: sessionId,
      playerId: input.playerId,
      externalGameId: game.externalId,
      currency: input.currency,
      balanceMinor: balance.value.currentBalance,
      locale: 'en_US',
      returnUrl: resolvedReturnUrl,
    })
  } else {
    aleaSession = await alea.launchGame({
      casinoSessionId: sessionId,
      providerId: game.providerId,
      playerId: input.playerId,
      externalGameId: game.externalId,
      isMobile: input.isMobile ?? false,
      currency: input.currency,
      balanceMinor: balance.value.currentBalance,
      locale: 'en_US',
      returnUrl: resolvedReturnUrl,
    })
  }

  await ctx.db
    .update(schema.gameSessions)
    .set({
      aleaSessionToken: aleaSession.sessionToken,
      aleaPlayUrl: aleaSession.playUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.gameSessions.id, sessionId))

  return ok({
    sessionId,
    playUrl: aleaSession.playUrl,
    externalGameId: game.externalId,
  })
}
