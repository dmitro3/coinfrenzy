import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  template: z.string(),
  playerId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'in_app']).default('email'),
  noEscape: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const player = await crm.fetchExtendedPlayerContext(ctx, parsed.playerId)
  if (!player) return jsonError(404, 'player_not_found')

  const result = crm.renderPreview(parsed.template, player, {
    channel: parsed.channel,
    noEscape: parsed.noEscape,
  })

  return NextResponse.json({
    ...result,
    player: {
      id: player.id,
      email: player.email,
      displayName: player.displayName ?? player.firstName ?? player.username ?? player.email,
      tierName: player.tierName,
      lifetimeSpendUsd: player.lifetimeSpendUsd,
    },
  })
}
