import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { tiers as tiersMod } from '@coinfrenzy/core'
import { canEditTiers } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reorderBody = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(99),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditTiers(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof reorderBody>
  try {
    parsed = reorderBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await tiersMod.reorderTiers(built.data.ctx, parsed.orderedIds)
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'INVALID') return jsonError(400, 'invalid')
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ ok: true })
}
