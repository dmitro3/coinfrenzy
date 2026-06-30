import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  filterTree: z.unknown(),
  limit: z.number().int().min(1).max(50).optional(),
})

// docs/11 §3 — preview the first N matching players for a filter tree.

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

  const result = await crm.previewSegment(ctx, parsed.filterTree, parsed.limit ?? 10)
  if (!result.ok) {
    return jsonError(
      400,
      result.error.code,
      'details' in result.error ? result.error.details : undefined,
    )
  }
  return NextResponse.json({
    players: result.value.players.map((p) => ({
      id: p.id,
      email: p.email,
      displayName: p.displayName,
      tierLevel: p.tierLevel,
      totalDepositedUsd: p.totalDepositedUsd,
      lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
    })),
  })
}
