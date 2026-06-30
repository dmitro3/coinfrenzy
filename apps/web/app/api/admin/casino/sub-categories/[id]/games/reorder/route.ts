import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  orderedGameIds: z.array(z.string().uuid()).min(1).max(1000),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.reorderGamesInSection(built.data.ctx, id, parsed.orderedGameIds)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'not_found') return jsonError(404, 'not_found')
    return jsonError(500, 'reorder_failed')
  }
  return NextResponse.json({ ok: true })
}
