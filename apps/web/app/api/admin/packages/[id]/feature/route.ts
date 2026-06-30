import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { packages as packagesMod } from '@coinfrenzy/core'
import { canEditPackages } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const featureBody = z.object({
  slot: z.union([z.literal(1), z.literal(2), z.null()]),
})

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditPackages(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }
  const { id } = await ctx.params

  let parsed: z.infer<typeof featureBody>
  try {
    parsed = featureBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await packagesMod.setFeaturedSlot(built.data.ctx, id, parsed.slot)
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    if (result.error.code === 'SLOT_CONFLICT') return jsonError(409, 'featured_slot_taken')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ ok: true })
}
