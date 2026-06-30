import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { packages as packagesMod } from '@coinfrenzy/core'
import { canEditPackages } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reorderBody = z.object({
  positions: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0).max(10_000),
      }),
    )
    .min(1)
    .max(500),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditPackages(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof reorderBody>
  try {
    parsed = reorderBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await packagesMod.reorderPackages(built.data.ctx, parsed.positions)
  await built.data.flushAfterCommit()

  if (!result.ok) return jsonError(400, result.error.code)
  return NextResponse.json({ ok: true })
}
