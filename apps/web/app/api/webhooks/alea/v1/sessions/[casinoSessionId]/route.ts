import 'server-only'

import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { adapters } from '@coinfrenzy/core'
import { env } from '@coinfrenzy/config'
import { schema } from '@coinfrenzy/db'

import { buildWebhookContext } from '@/lib/webhook-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx2: { params: Promise<{ casinoSessionId: string }> },
): Promise<Response> {
  const { casinoSessionId } = await ctx2.params
  const signature = req.headers.get('digest') ?? undefined

  const verification = adapters.alea.verifyAleaDigestSignature({
    type: 'SESSION',
    signature,
    casinoSessionId,
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

  const { ctx } = buildWebhookContext('alea')
  const rows = await ctx.db
    .select({
      playerId: schema.gameSessions.playerId,
      currency: schema.gameSessions.currency,
    })
    .from(schema.gameSessions)
    .where(eq(schema.gameSessions.id, casinoSessionId))
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

  const result: {
    country: string
    currency: string
    casinoPlayerId: string
    isTest?: boolean
  } = {
    country: 'US',
    currency: session.currency,
    casinoPlayerId: `${session.playerId}_${session.currency}`,
  }

  if (env().NODE_ENV === 'production') {
    result.isTest = true
  }

  ctx.logger.info('Alea session response=======>>>>>', { result })

  return NextResponse.json(result)
}
