import 'server-only'

import { and, eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { adapters, ledger } from '@coinfrenzy/core'
import { isCoinCurrency } from '@coinfrenzy/config'
import { schema } from '@coinfrenzy/db'

import { buildWebhookContext } from '@/lib/webhook-context'
import { getHPBalance } from '../../../drift'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx2: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await ctx2.params
  const signature = req.headers.get('digest') ?? undefined
  const casinoSessionId = req.nextUrl.searchParams.get('casinoSessionId') ?? undefined
  const currency = req.nextUrl.searchParams.get('currency') ?? undefined
  const gameId = req.nextUrl.searchParams.get('gameId') ?? undefined
  const integratorId = req.nextUrl.searchParams.get('integratorId') ?? undefined
  const softwareId = req.nextUrl.searchParams.get('softwareId') ?? undefined

  if (
    !casinoSessionId ||
    !currency ||
    !gameId ||
    !integratorId ||
    !softwareId ||
    !isCoinCurrency(currency)
  ) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: 'Invalid balance request parameters',
      },
      { status: 500 },
    )
  }

  const verification = adapters.alea.verifyAleaDigestSignature({
    type: 'BALANCE',
    signature,
    casinoSessionId,
    currency,
    gameId,
    integratorId,
    softwareId,
  })

  if (!verification.ok) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: 'Signature Incorrect',
      },
      { status: 500 },
    )
  }

  const [playerIdFromPath, currencyFromPath] = userId.split('_')
  if (!playerIdFromPath || !currencyFromPath) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: "Player couldn't be found in casino's system.",
      },
      { status: 500 },
    )
  }

  const { ctx } = buildWebhookContext('alea')
  const rows = await ctx.db
    .select({
      playerId: schema.gameSessions.playerId,
      currency: schema.gameSessions.currency,
      gameExternalId: schema.games.externalId,
    })
    .from(schema.gameSessions)
    .innerJoin(schema.games, eq(schema.games.id, schema.gameSessions.gameId))
    .where(
      and(eq(schema.gameSessions.id, casinoSessionId), eq(schema.gameSessions.status, 'active')),
    )
    .limit(1)

  const session = rows[0]
  if (!session) {
    return NextResponse.json(
      {
        status: 'DENIED',
        code: 'SESSION_EXPIRED',
        message: 'Game Session Expired',
      },
      { status: 403 },
    )
  }

  if (session.gameExternalId !== gameId) {
    return NextResponse.json(
      {
        status: 'DENIED',
        code: 'GAME_NOT_ALLOWED',
        message: 'This game could not be found in the casino.',
      },
      { status: 404 },
    )
  }

  if (currency !== session.currency || currencyFromPath !== session.currency) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: 'Request Made with invalid currency.',
      },
      { status: 500 },
    )
  }

  if (playerIdFromPath !== session.playerId) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: "Player couldn't be found in casino's system.",
      },
      { status: 500 },
    )
  }

  const balance = await ledger.getBalance(ctx, session.playerId, session.currency)
  if (!balance.ok) {
    return NextResponse.json(
      {
        status: 'ERROR',
        code: 'INVALID_REQUEST',
        message: "Player couldn't be found in casino's system.",
      },
      { status: 500 },
    )
  }

  const realBalance = await getHPBalance(session.playerId, session.currency)

  ctx.logger.info('Alea balance response=======>>>>>', {
    realBalance,
    bonusBalance: 0.0,
  })

  return NextResponse.json({
    realBalance,
    bonusBalance: 0.0,
  })
}
