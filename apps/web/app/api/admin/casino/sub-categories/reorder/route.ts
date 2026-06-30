import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.reorderSubCategories(built.data.ctx, parsed.orderedIds)
  await built.data.flushAfterCommit()
  if (!res.ok) return jsonError(500, 'reorder_failed')
  return NextResponse.json({ ok: true })
}
